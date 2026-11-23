/**
 * 应用级 IPC：返回运行时基础信息。
 */

import { app, ipcMain, shell } from 'electron';
import { realpath, stat } from 'node:fs/promises';
import { consumePendingSession } from '../services/notifications/notification-service';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import {
  appInfoSchema,
  openDataLocationSchema,
  type AppInfo,
  type OpenDataLocation
} from '@shared/ipc/contracts';
import { getAppDataPaths } from '../services/storage/paths';
import { fail, ok, type Result } from '@shared/ipc/result';
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

  ipcMain.handle(
    IPC_CHANNELS.appOpenDataLocation,
    async (_event, rawTarget: unknown): Promise<Result<{ opened: boolean }>> => {
      const parsed = openDataLocationSchema.safeParse(rawTarget);
      if (!parsed.success) {
        return fail('INVALID_DATA_LOCATION', '不支持的数据目录');
      }
      const paths = getAppDataPaths();
      const target: OpenDataLocation = parsed.data;
      const targetPath =
        target === 'plugins' ? paths.plugins : target === 'skills' ? paths.skills : paths.mcp;
      const error = await shell.openPath(targetPath);
      return error ? fail('OPEN_DATA_LOCATION_FAILED', error) : ok({ opened: true });
    }
  );

  ipcMain.handle(IPC_CHANNELS.appRelaunch, (): Result<{ relaunched: boolean }> => {
    // 等 IPC 响应返回后再重启，避免渲染层看到连接被提前关闭
    setTimeout(() => {
      app.relaunch();
      app.quit();
    }, 50);
    return ok({ relaunched: true });
  });

  ipcMain.handle(
    IPC_CHANNELS.appShowItemInFolder,
    async (_event, rawPath: unknown): Promise<Result<{ shown: boolean }>> => {
      if (typeof rawPath !== 'string' || !rawPath) return fail('INVALID_PATH', '路径不合法');
      const target = await realpath(rawPath).catch(() => undefined);
      if (!target) return fail('PATH_NOT_FOUND', '路径不存在');
      const info = await stat(target).catch(() => undefined);
      if (!info) return fail('PATH_NOT_FOUND', '路径不存在');
      shell.showItemInFolder(target);
      return ok({ shown: true });
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
