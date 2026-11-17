/* Agent 服务：把 Provider、文件工具与 AgentLoop 组装成一次运行。 */

import { randomUUID } from 'node:crypto';
import {
  AgentLoop,
  EventBus,
  PermissionGateway,
  createNexusEvent,
  type AgentToolDefinition
} from '@nexus/core';
import {
  OpenAICompatibleProvider,
  type ChatProvider,
  type ProviderToolCall
} from '@nexus/providers';
import { createFileToolset } from '@nexus/tools';
import { CheckpointService } from '../checkpoint/checkpoint-service';
import type { NexusEvent } from '@shared/events';
import type { AgentProviderConfig, AgentRunInput, AgentRunResult } from '@shared/ipc/contracts';

/* 测试可注入 Provider 工厂；生产默认使用 OpenAI 兼容实现。 */
export type ProviderFactory = (config: AgentProviderConfig) => ChatProvider;

export interface AgentRunHooks {
  runId?: string;
  signal?: AbortSignal;
  onEvent?: (event: NexusEvent) => void;
  approveTool?: (
    call: ProviderToolCall,
    tool: AgentToolDefinition,
    approvalId: string
  ) => Promise<boolean>;
}

/* 从工具参数中读取 path；其他工具返回 undefined。 */
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
  constructor(private readonly createProvider: ProviderFactory = createOpenAIProvider) {}

  /* 执行一次完整任务；事件通过 hooks.onEvent 实时回传。 */
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
      const checkpoints = new CheckpointService();
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
        return toolset.execute(call.name, call.arguments);
      };
      const tools: AgentToolDefinition[] = toolset.definitions.map((definition) => ({
        name: definition.name,
        description: definition.description,
        inputSchema: definition.inputSchema,
        permission: definition.permission,
        requiresApproval: definition.requiresApproval
      }));

      const loop = new AgentLoop({
        provider: this.createProvider(providerConfig),
        providerName: providerConfig.name,
        model: providerConfig.model,
        sessionId: input.sessionId,
        runId,
        messages: [{ role: 'user', content: input.prompt }],
        tools,
        permissionGateway: new PermissionGateway(['read', 'write', 'execute']),
        executeTool,
        ...(hooks.approveTool ? { approveTool: hooks.approveTool } : {}),
        eventBus,
        ...(providerConfig.extraParams ? { extraParams: providerConfig.extraParams } : {}),
        ...(hooks.signal ? { signal: hooks.signal } : {}),
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
