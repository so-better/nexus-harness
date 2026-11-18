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
  OpenAICompatibleProvider,
  type ChatMessage,
  type ChatProvider,
  type ProviderToolCall
} from '@nexus/providers';
import { createFileToolset } from '@nexus/tools';
import { ArtifactService } from '../artifacts/artifact-service';
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

export const createAgentProvider: ProviderFactory = (config) =>
  new OpenAICompatibleProvider({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    ...(config.headers ? { headers: config.headers } : {})
  });

export class AgentService {
  private readonly createProvider: ProviderFactory;
  private readonly artifactBaseDir: string | undefined;
  private readonly database: DatabaseSync | undefined;

  constructor(options: AgentServiceOptions = {}) {
    this.createProvider = options.createProvider ?? createAgentProvider;
    this.artifactBaseDir = options.artifactBaseDir;
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

      const executeTool = async (call: { name: string; arguments: unknown }) => {
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
              eventBus.publish(
                createNexusEvent({
                  sessionId: input.sessionId,
                  runId,
                  seq: 1,
                  type: 'checkpoint.created',
                  payload: { checkpointId: checkpoint.checkpointId, label: call.name }
                })
              );
            } catch {
              // 路径非法时交由工具返回结构化错误，不创建检查点
            }
          }
        }
        const result = await toolset.execute(call.name, call.arguments);
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

      const allToolDefinitions = [...(toolset?.definitions ?? []), askUserToolDefinition];
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
