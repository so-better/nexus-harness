/**
 * Agent 服务：把 Provider、文件工具与 AgentLoop 组装成一次运行。
 */

import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  AgentLoop,
  EventBus,
  PermissionGateway,
  createNexusEvent,
  type AgentToolDefinition
} from '@nexus/core';
import {
  AnthropicProvider,
  OllamaProvider,
  OpenAICompatibleProvider,
  type ChatMessage,
  type ChatProvider,
  type ProviderToolCall
} from '@nexus/providers';
import { createFileToolset } from '@nexus/tools';
import { ArtifactService } from '../artifacts/artifact-service';
import { FileService } from '../files/file-service';
import { CheckpointService } from '../checkpoint/checkpoint-service';
import {
  AgentContextService,
  TOOL_OUTPUT_ARTIFACT_CHAR_LIMIT,
  TOOL_OUTPUT_PREVIEW_CHAR_LIMIT
} from './context-service';
import type { NexusEvent } from '@shared/events';
import type {
  AgentMode,
  AgentProviderConfig,
  AgentRunInput,
  AgentRunResult
} from '@shared/ipc/contracts';
import { askUserInputSchema, type AskQuestion, type AskUserAnswer } from '@shared/ask-user';

/**
 * 测试可注入 Provider 工厂；生产默认使用 OpenAI 兼容实现。
 */
export type ProviderFactory = (config: AgentProviderConfig) => ChatProvider;

/**
 * AgentService 依赖；测试可注入 Provider 工厂、产物目录与数据库。
 */
export interface AgentServiceOptions {
  fileBaseDir?: string;
  createProvider?: ProviderFactory;
  artifactBaseDir?: string;
  database?: DatabaseSync;
}

export interface AgentRunHooks {
  runId?: string;
  signal?: AbortSignal;
  history?: ChatMessage[];
  onEvent?: (event: NexusEvent) => void;
  approveTool?: (
    call: ProviderToolCall,
    tool: AgentToolDefinition,
    approvalId: string
  ) => Promise<boolean>;
  askUser?: (requestId: string, questions: AskQuestion[]) => Promise<AskUserAnswer[] | undefined>;
}

/**
 * 从工具参数中读取 path；其他工具返回 undefined。
 */
const getPathArgument = (input: unknown): string | undefined => {
  if (!input || typeof input !== 'object' || !('path' in input)) return undefined;
  const pathValue = (input as { path?: unknown }).path;
  return typeof pathValue === 'string' ? pathValue : undefined;
};

const getCreateDirsArgument = (input: unknown): boolean =>
  !!input &&
  typeof input === 'object' &&
  'createDirs' in input &&
  (input as { createDirs?: unknown }).createDirs === true;

interface SaveFileInput {
  name: string;
  content: string;
  mime?: string;
}

/**
 * 校验 save_file 参数，避免把非文本内容写入输出目录。
 */
const parseSaveFileInput = (input: unknown): SaveFileInput | undefined => {
  if (!input || typeof input !== 'object') return undefined;
  const record = input as Record<string, unknown>;
  if (typeof record['name'] !== 'string' || !record['name'].trim()) return undefined;
  if (typeof record['content'] !== 'string' || record['content'].length > 5_000_000)
    return undefined;
  if (record['mime'] !== undefined && typeof record['mime'] !== 'string') return undefined;
  return {
    name: record['name'].trim(),
    content: record['content'],
    ...(typeof record['mime'] === 'string' && record['mime'] ? { mime: record['mime'] } : {})
  };
};

const saveFileToolDefinition: AgentToolDefinition = {
  name: 'save_file',
  description: '把生成的文本文件保存到 Nexus 输出文件目录，返回可另存为的 fileId。',
  permission: 'write',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '文件名，包含扩展名，例如 report.md' },
      content: { type: 'string', description: '文件文本内容' },
      mime: { type: 'string', description: '可选 MIME 类型' }
    },
    required: ['name', 'content']
  }
};

const askUserToolDefinition: AgentToolDefinition = {
  name: 'ask_user',
  description: '向用户提出 1-4 个阻塞性澄清问题，可包含选项或自由文本；用户回答后继续执行。',
  permission: 'read',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        minItems: 1,
        maxItems: 4,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            header: { type: 'string' },
            question: { type: 'string' },
            options: {
              type: 'array',
              minItems: 2,
              maxItems: 9,
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  label: { type: 'string' },
                  description: { type: 'string' }
                },
                required: ['id', 'label']
              }
            },
            multiple: { type: 'boolean' },
            allowOther: { type: 'boolean' },
            required: { type: 'boolean' }
          },
          required: ['id', 'question']
        }
      }
    },
    required: ['questions']
  }
};

const PLAN_ALLOWED_TOOLS = new Set([
  'read_file',
  'list_dir',
  'grep',
  'git_status',
  'git_diff',
  'ask_user',
  'search_skills',
  'read_skill'
]);

const modeSystemPrompt = (mode: AgentMode): string =>
  mode === 'plan'
    ? '当前处于 Plan 模式：只能读取、分析和制定计划，不得写文件、执行命令、发起网络请求或启动 MCP 工具。需要澄清时使用 ask_user；需要执行时提示用户切换到 Build。'
    : '当前处于 Build 模式：可以按权限和审批要求使用读写与执行工具；高风险操作仍需用户审批。需要澄清时使用 ask_user。';

export const createAgentProvider: ProviderFactory = (config) => {
  const shared = {
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    ...(config.headers ? { headers: config.headers } : {})
  };

  if (config.protocol === 'anthropic') return new AnthropicProvider(shared);
  if (config.protocol === 'ollama') return new OllamaProvider(shared);
  return new OpenAICompatibleProvider(shared);
};

export class AgentService {
  private readonly createProvider: ProviderFactory;
  private readonly artifactBaseDir: string | undefined;
  private readonly fileBaseDir: string | undefined;
  private readonly database: DatabaseSync | undefined;

  constructor(options: AgentServiceOptions = {}) {
    this.createProvider = options.createProvider ?? createAgentProvider;
    this.artifactBaseDir = options.artifactBaseDir;
    this.fileBaseDir = options.fileBaseDir;
    this.database = options.database;
  }

  /**
   * 执行一次完整任务；事件通过 hooks.onEvent 实时回传。
   */
  async run(
    input: AgentRunInput,
    providerConfig: AgentProviderConfig,
    hooks: AgentRunHooks = {}
  ): Promise<AgentRunResult> {
    const runId = hooks.runId ?? randomUUID();
    const eventBus = new EventBus((error) => {
      console.error('Agent 事件处理失败', error);
    });
    const unsubscribe = hooks.onEvent ? eventBus.subscribeAll(hooks.onEvent) : undefined;

    try {
      const modelConfig = providerConfig.models.find((model) => model.id === input.modelId);
      if (!modelConfig) {
        throw new Error(`PROVIDER_MODEL_NOT_FOUND: ${input.modelId}`);
      }

      const mode = input.mode ?? 'build';
      const toolset =
        input.rootPaths.length > 0 ? await createFileToolset(input.rootPaths) : undefined;
      const provider = this.createProvider(providerConfig);
      const artifacts = new ArtifactService(this.artifactBaseDir, this.database);
      const files = this.database ? new FileService(this.database, this.fileBaseDir) : undefined;
      const checkpoints = new CheckpointService();
      const context = new AgentContextService({
        provider,
        model: modelConfig.id,
        contextWindow: modelConfig.contextWindow,
        maxOutputTokens: modelConfig.maxOutputTokens,
        artifacts,
        sessionId: input.sessionId,
        runId,
        ...(providerConfig.extraParams ? { extraParams: providerConfig.extraParams } : {}),
        ...(hooks.signal ? { signal: hooks.signal } : {})
      });
      const checkpointRoot = toolset ? await toolset.resolvePath('.') : undefined;

      const executeTool = async (call: { id?: string; name: string; arguments: unknown }) => {
        if (call.name === 'ask_user') {
          const parsed = askUserInputSchema.safeParse(call.arguments);
          if (!parsed.success) {
            return {
              ok: false,
              output: '',
              error: { code: 'ASK_USER_INVALID_INPUT', message: '提问参数不合法' }
            };
          }
          if (!hooks.askUser) {
            return {
              ok: false,
              output: '',
              error: { code: 'ASK_USER_UNAVAILABLE', message: '当前无法等待用户回答' }
            };
          }

          const requestId = randomUUID();
          eventBus.publish(
            createNexusEvent({
              sessionId: input.sessionId,
              runId,
              seq: 1,
              type: 'ask_user.requested',
              payload: { requestId, questions: parsed.data.questions }
            })
          );
          const answers = await hooks.askUser(requestId, parsed.data.questions);
          eventBus.publish(
            createNexusEvent({
              sessionId: input.sessionId,
              runId,
              seq: 1,
              type: 'ask_user.resolved',
              payload: { requestId, answers: answers ?? [], cancelled: !answers }
            })
          );
          if (!answers) {
            return {
              ok: false,
              output: '',
              error: { code: 'ASK_USER_CANCELLED', message: '用户未回答提问' }
            };
          }
          return { ok: true, output: JSON.stringify({ answers }) };
        }

        if (mode === 'plan' && !PLAN_ALLOWED_TOOLS.has(call.name)) {
          return {
            ok: false,
            output: '',
            error: { code: 'TOOL_MODE_DENIED', message: `Plan 模式不可用工具：${call.name}` }
          };
        }
        if (call.name === 'save_file') {
          const parsed = parseSaveFileInput(call.arguments);
          if (!parsed) {
            return {
              ok: false,
              output: '',
              error: { code: 'FILE_INVALID_INPUT', message: '文件参数不合法' }
            };
          }
          if (!files) {
            return {
              ok: false,
              output: '',
              error: { code: 'FILE_SERVICE_UNAVAILABLE', message: '文件服务不可用' }
            };
          }
          try {
            const file = await files.save({
              sessionId: input.sessionId,
              runId,
              name: parsed.name,
              content: parsed.content,
              ...(parsed.mime ? { mime: parsed.mime } : {})
            });
            eventBus.publish(
              createNexusEvent({
                sessionId: input.sessionId,
                runId,
                seq: 1,
                type: 'file.created',
                payload: {
                  fileId: file.id,
                  name: file.name,
                  mime: file.mime,
                  bytes: file.bytes,
                  source: file.source
                }
              })
            );
            return { ok: true, output: JSON.stringify(file) };
          } catch (error) {
            return {
              ok: false,
              output: '',
              error: {
                code: 'FILE_SAVE_FAILED',
                message: error instanceof Error ? error.message : '保存文件失败'
              }
            };
          }
        }
        if (!toolset || !checkpointRoot) {
          return {
            ok: false,
            output: '',
            error: {
              code: 'TOOL_WORKSPACE_REQUIRED',
              message: '未选择工作区，无法执行本地文件或命令操作'
            }
          };
        }

        let checkpointInfo:
          { checkpointId: string; label: string; path: string; existed: boolean } | undefined;
        if (call.name === 'write_file' || call.name === 'apply_patch') {
          const pathArgument = getPathArgument(call.arguments);
          if (pathArgument) {
            try {
              const filePath = await toolset.resolvePath(pathArgument, {
                mode: 'write',
                createDirs: getCreateDirsArgument(call.arguments)
              });
              const checkpoint = await checkpoints.create({
                sessionId: input.sessionId,
                runId,
                rootPath: checkpointRoot,
                filePath,
                label: call.name
              });
              checkpointInfo = {
                checkpointId: checkpoint.checkpointId,
                label: call.name,
                path: filePath,
                existed: checkpoint.existed
              };
            } catch {
              // 路径非法时交由工具返回结构化错误，不创建检查点
            }
          }
        }
        const result = await toolset.execute(call.name, call.arguments);
        if (result.ok && checkpointInfo) {
          eventBus.publish(
            createNexusEvent({
              sessionId: input.sessionId,
              runId,
              seq: 1,
              type: 'checkpoint.created',
              payload: {
                ...checkpointInfo,
                ...(call.id ? { toolCallId: call.id } : {})
              }
            })
          );
        }
        if (!result.ok || result.output.length <= TOOL_OUTPUT_ARTIFACT_CHAR_LIMIT) return result;

        try {
          const stored = await artifacts.saveText(
            input.sessionId,
            `tool-${call.name}`,
            result.output,
            { runId }
          );
          return {
            ok: true,
            output: JSON.stringify({
              truncated: true,
              artifactId: stored.artifactId,
              bytes: stored.bytes,
              preview: result.output.slice(0, TOOL_OUTPUT_PREVIEW_CHAR_LIMIT)
            }),
            artifactId: stored.artifactId,
            bytes: stored.bytes
          };
        } catch {
          // 产物落盘失败时降级为短预览，不能因此让工具调用失败
          return {
            ok: true,
            output: `${result.output.slice(0, TOOL_OUTPUT_PREVIEW_CHAR_LIMIT)}\n…[输出过长且产物保存失败]`
          };
        }
      };
      const modeMessage: ChatMessage = { role: 'system', content: modeSystemPrompt(mode) };
      const shouldAddUserMessage = !input.regenerateMessageId;
      const userMessage: ChatMessage = { role: 'user', content: input.prompt };
      if (shouldAddUserMessage) {
        eventBus.publish(
          createNexusEvent({
            sessionId: input.sessionId,
            runId,
            seq: 1,
            type: 'message.completed',
            payload: { messageId: randomUUID(), role: 'user', content: input.prompt }
          })
        );
      }

      const allToolDefinitions = [
        ...(toolset?.definitions ?? []),
        askUserToolDefinition,
        saveFileToolDefinition
      ];
      const visibleDefinitions =
        mode === 'plan'
          ? allToolDefinitions.filter((definition) => PLAN_ALLOWED_TOOLS.has(definition.name))
          : allToolDefinitions;
      const blockedTools = allToolDefinitions
        .filter((definition) => !PLAN_ALLOWED_TOOLS.has(definition.name))
        .map((definition) => definition.name);
      const tools: AgentToolDefinition[] = visibleDefinitions.map((definition) => ({
        name: definition.name,
        description: definition.description,
        inputSchema: definition.inputSchema,
        permission: definition.permission,
        requiresApproval: definition.requiresApproval
      }));

      const loop = new AgentLoop({
        provider,
        providerName: providerConfig.name,
        model: modelConfig.id,
        sessionId: input.sessionId,
        runId,
        messages: [
          modeMessage,
          ...(hooks.history ?? []),
          ...(shouldAddUserMessage ? [userMessage] : [])
        ],
        tools,
        ...(mode === 'plan' ? { blockedTools } : {}),
        permissionGateway: new PermissionGateway(
          mode === 'plan' ? ['read'] : ['read', 'write', 'execute']
        ),
        executeTool,
        prepareContext: (messages) => context.prepare(messages, tools),
        ...(hooks.approveTool ? { approveTool: hooks.approveTool } : {}),
        eventBus,
        ...(providerConfig.extraParams ? { extraParams: providerConfig.extraParams } : {}),
        ...(hooks.signal ? { signal: hooks.signal } : {}),
        maxTokens: modelConfig.maxOutputTokens,
        ...(input.maxSteps === undefined ? {} : { maxSteps: input.maxSteps })
      });

      const result = await loop.run();

      return {
        runId,
        sessionId: input.sessionId,
        steps: result.steps,
        toolCalls: result.toolCalls,
        finishReason: result.finishReason,
        messages: result.messages.map((message) => ({
          role: message.role,
          content: message.content
        }))
      };
    } finally {
      unsubscribe?.();
    }
  }
}
