/* Agent IPC：校验运行参数并执行一次 AgentLoop。 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { agentRunInputSchema, type AgentRunResult } from '@shared/ipc/contracts';
import { fail, ok, type Result } from '@shared/ipc/result';
import { AgentService } from '../services/agent/agent-service';
import { providerStore } from '../services/provider/provider-store';

const agentService = new AgentService();

/* 注册 agent:run；返回最终结果，流式事件后续单独推送。 */
export const registerAgentIpc = (): void => {
  ipcMain.handle(
    IPC_CHANNELS.agentRun,
    async (_event, rawInput: unknown): Promise<Result<AgentRunResult>> => {
      const parsed = agentRunInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return fail('AGENT_INVALID_INPUT', 'Agent 运行参数不合法', parsed.error.flatten());
      }

      try {
        const provider = await providerStore.get(parsed.data.providerId);
        if (!provider) {
          return fail('PROVIDER_NOT_FOUND', `Provider 不存在：${parsed.data.providerId}`);
        }
        if (!provider.enabled) {
          return fail('PROVIDER_DISABLED', `Provider 已停用：${parsed.data.providerId}`);
        }
        return ok(await agentService.run(parsed.data, provider));
      } catch (error) {
        console.error('Agent 运行失败', error);
        return fail('AGENT_RUN_FAILED', error instanceof Error ? error.message : 'Agent 运行失败');
      }
    }
  );
};
