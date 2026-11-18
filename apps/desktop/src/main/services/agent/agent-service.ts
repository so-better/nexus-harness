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
import type { AgentProviderConfig, AgentRunInput, AgentRunResult } from '@shared/ipc/contracts';

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

const createOpenAIProvider: ProviderFactory = (config) =>
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
    this.createProvider = options.createProvider ?? createOpenAIProvider;
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
      const toolset = await createFileToolset(input.rootPaths);
      const provider = this.createProvider(providerConfig);
      const artifacts = new ArtifactService(this.artifactBaseDir, this.database);
      const checkpoints = new CheckpointService();
      const context = new AgentContextService({
        provider,
        model: providerConfig.model,
        contextWindow: providerConfig.contextWindow,
        maxOutputTokens: providerConfig.maxOutputTokens,
        artifacts,
        sessionId: input.sessionId,
        runId,
        ...(providerConfig.extraParams ? { extraParams: providerConfig.extraParams } : {}),
        ...(hooks.signal ? { signal: hooks.signal } : {})
      });
      const checkpointRoot = await toolset.resolvePath('.');

      const executeTool = async (call: { name: string; arguments: unknown }) => {
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
      const userMessage: ChatMessage = { role: 'user', content: input.prompt };
      eventBus.publish(
        createNexusEvent({
          sessionId: input.sessionId,
          runId,
          seq: 1,
          type: 'message.completed',
          payload: { messageId: randomUUID(), role: 'user', content: input.prompt }
        })
      );

      const tools: AgentToolDefinition[] = toolset.definitions.map((definition) => ({
        name: definition.name,
        description: definition.description,
        inputSchema: definition.inputSchema,
        permission: definition.permission,
        requiresApproval: definition.requiresApproval
      }));

      const loop = new AgentLoop({
        provider,
        providerName: providerConfig.name,
        model: providerConfig.model,
        sessionId: input.sessionId,
        runId,
        messages: [...(hooks.history ?? []), userMessage],
        tools,
        permissionGateway: new PermissionGateway(['read', 'write', 'execute']),
        executeTool,
        prepareContext: (messages) => context.prepare(messages, tools),
        ...(hooks.approveTool ? { approveTool: hooks.approveTool } : {}),
        eventBus,
        ...(providerConfig.extraParams ? { extraParams: providerConfig.extraParams } : {}),
        ...(hooks.signal ? { signal: hooks.signal } : {}),
        maxTokens: providerConfig.maxOutputTokens,
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
