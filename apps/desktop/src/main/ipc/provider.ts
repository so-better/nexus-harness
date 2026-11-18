/**
 * Provider 配置 IPC：只回传公开字段，API Key 由 safeStorage 加密保存。
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import {
  providerSettingsSchema,
  type ProviderPublic,
  type ProviderRemoveResult
} from '@shared/ipc/contracts';
import { fail, ok, type Result } from '@shared/ipc/result';
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
