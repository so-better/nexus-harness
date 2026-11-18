/**
 * 应用级 IPC：返回运行时基础信息，供渲染进程确认桥接可用。
 */

import { app, ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { appInfoSchema, type AppInfo } from '@shared/ipc/contracts';
import { ok, type Result } from '@shared/ipc/result';

/**
 * 注册应用信息处理器；只暴露非敏感字段。
 */
export const registerAppIpc = (): void => {
  ipcMain.handle(IPC_CHANNELS.appGetInfo, async (): Promise<Result<AppInfo>> => {
    const info = appInfoSchema.parse({
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform
    });

    return ok(info);
  });
};
