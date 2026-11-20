/**
 * 应用级 IPC：返回运行时基础信息。
 */

import { app, ipcMain, shell } from 'electron';
import { consumePendingSession } from '../services/notifications/notification-service';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { appInfoSchema, type AppInfo } from '@shared/ipc/contracts';
import { ok, type Result } from '@shared/ipc/result';
import desktopPackage from '../../../package.json';

/**
 * 注册应用信息处理器；只暴露非敏感字段。
 */
export const registerAppIpc = (): void => {
  ipcMain.handle(
    IPC_CHANNELS.appOpenExternal,
    async (_event, rawUrl: unknown): Promise<Result<{ opened: boolean }>> => {
      if (typeof rawUrl !== 'string' || !/^(https?:\/\/|mailto:)/i.test(rawUrl)) {
        return {
          ok: false,
          error: { code: 'INVALID_URL', message: '只允许打开 HTTP/HTTPS 或 mailto 链接' }
        };
      }
      await shell.openExternal(rawUrl);
      return ok({ opened: true });
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.appOpenPath,
    async (_event, rawPath: unknown): Promise<Result<{ opened: boolean }>> => {
      if (typeof rawPath !== 'string' || !rawPath) {
        return { ok: false, error: { code: 'INVALID_PATH', message: '路径不合法' } };
      }
      const error = await shell.openPath(rawPath);
      return error
        ? { ok: false, error: { code: 'OPEN_PATH_FAILED', message: error } }
        : ok({ opened: true });
    }
  );

  ipcMain.handle(IPC_CHANNELS.appConsumePendingSession, (): Result<string | null> =>
    ok(consumePendingSession())
  );

  ipcMain.handle(IPC_CHANNELS.appGetInfo, async (): Promise<Result<AppInfo>> => {
    const info = appInfoSchema.parse({
      name: app.getName(),
      version: desktopPackage.version,
      platform: process.platform
    });

    return ok(info);
  });
};
