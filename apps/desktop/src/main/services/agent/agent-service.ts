/* Agent 服务：把 Provider、文件工具与 AgentLoop 组装成一次运行。 */

import { randomUUID } from 'node:crypto';
import { AgentLoop, EventBus, PermissionGateway, type AgentToolDefinition } from '@nexus/core';
import { OpenAICompatibleProvider, type ChatProvider } from '@nexus/providers';
import { createFileToolset } from '@nexus/tools';
import type { AgentProviderConfig, AgentRunInput, AgentRunResult } from '@shared/ipc/contracts';

/* 测试可注入 Provider 工厂；生产默认使用 OpenAI 兼容实现。 */
export type ProviderFactory = (config: AgentProviderConfig) => ChatProvider;

const createOpenAIProvider: ProviderFactory = (config) =>
  new OpenAICompatibleProvider({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    ...(config.headers ? { headers: config.headers } : {})
  });

export class AgentService {
  constructor(private readonly createProvider: ProviderFactory = createOpenAIProvider) {}

  /* 执行一次完整任务；当前返回最终结果，流式事件后续通过 IPC 推送。 */
  async run(input: AgentRunInput, providerConfig: AgentProviderConfig): Promise<AgentRunResult> {
    const runId = randomUUID();
    const toolset = await createFileToolset(input.rootPaths);
    const tools: AgentToolDefinition[] = toolset.definitions.map((definition) => ({
      name: definition.name,
      description: definition.description,
      inputSchema: definition.inputSchema,
      permission: definition.permission,
      requiresApproval: definition.requiresApproval
    }));

    const permissionGateway = new PermissionGateway(['read']);
    const eventBus = new EventBus((error) => {
      console.error('Agent 事件处理失败', error);
    });

    const loop = new AgentLoop({
      provider: this.createProvider(providerConfig),
      providerName: providerConfig.name,
      model: providerConfig.model,
      sessionId: input.sessionId,
      runId,
      messages: [{ role: 'user', content: input.prompt }],
      tools,
      permissionGateway,
      executeTool: async (call) => toolset.execute(call.name, call.arguments),
      eventBus,
      ...(providerConfig.extraParams ? { extraParams: providerConfig.extraParams } : {}),
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
  }
}
