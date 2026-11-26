/**
 * Provider 配置 IPC：本地配置直接回传，API Key 随 Provider 明文保存。
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import {
  providerSettingsSchema,
  providerTestInputSchema,
  type ProviderPublic,
  type ProviderProbeResult,
  type ProviderRemoveResult
} from '@shared/ipc/contracts';
import { fail, ok, type Result } from '@shared/ipc/result';
import { ProviderProbeError, probeProvider } from '../services/provider/provider-probe';
import { providerStore } from '../services/provider/provider-store';

/**
 * 注册 Provider 列表、保存与删除。
 */
export const registerProviderIpc = (): void => {
  ipcMain.handle(IPC_CHANNELS.providerList, async (): Promise<Result<ProviderPublic[]>> => {
    try {
      return ok(await providerStore.list());
    } catch (error) {
      return fail('PROVIDER_LIST_FAILED', error instanceof Error ? error.message : '读取配置失败');
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.providerSave,
    async (_event, rawInput: unknown): Promise<Result<ProviderPublic>> => {
      const parsed = providerSettingsSchema.safeParse(rawInput);
      if (!parsed.success) {
        return fail('PROVIDER_INVALID_INPUT', 'Provider 配置不合法', parsed.error.flatten());
      }

      try {
        return ok(await providerStore.save(parsed.data));
      } catch (error) {
        return fail(
          'PROVIDER_SAVE_FAILED',
          error instanceof Error ? error.message : '保存配置失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.providerTest,
    async (_event, rawInput: unknown): Promise<Result<ProviderProbeResult>> => {
      const parsed = providerTestInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return fail('PROVIDER_INVALID_INPUT', '连接测试参数不合法', parsed.error.flatten());
      }

      const stored =
        parsed.data.id === undefined ? undefined : await providerStore.get(parsed.data.id);
      if (parsed.data.id !== undefined && !stored) {
        return fail('PROVIDER_NOT_FOUND', `Provider 不存在：${parsed.data.id}`);
      }

      const protocol = parsed.data.protocol ?? stored?.protocol ?? 'openai';
      const apiKey = parsed.data.apiKey ?? stored?.apiKey;
      if (!apiKey) {
        return fail('PROVIDER_INVALID_INPUT', '连接测试需要 API Key');
      }

      const headers = parsed.data.headers ?? stored?.headers;

      try {
        return ok(
          await probeProvider({
            protocol,
            baseUrl: parsed.data.baseUrl,
            ...(apiKey ? { apiKey } : {}),
            ...(headers === undefined ? {} : { headers })
          })
        );
      } catch (error) {
        if (error instanceof ProviderProbeError) {
          return fail(error.code, error.message);
        }
        return fail(
          'PROVIDER_TEST_FAILED',
          error instanceof Error ? error.message : '连接测试失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.providerRemove,
    async (_event, rawId: unknown): Promise<Result<ProviderRemoveResult>> => {
      if (typeof rawId !== 'string' || !rawId) {
        return fail('PROVIDER_INVALID_INPUT', 'Provider id 不合法');
      }

      try {
        await providerStore.remove(rawId);
        return ok({ id: rawId });
      } catch (error) {
        return fail(
          'PROVIDER_REMOVE_FAILED',
          error instanceof Error ? error.message : '删除配置失败'
        );
      }
    }
  );
};
