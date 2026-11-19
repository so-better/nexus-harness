/**
 * 窗口控制 IPC：供自定义标题栏使用。
 */

import { BrowserWindow, ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { fail, ok, type Result } from '@shared/ipc/result';

const windowFor = (event: Electron.IpcMainInvokeEvent): BrowserWindow | null =>
  BrowserWindow.fromWebContents(event.sender);

/**
 * 注册窗口最小化、最大化、关闭与状态查询。
 */
export const registerWindowIpc = (): void => {
  ipcMain.handle(IPC_CHANNELS.windowMinimize, async (event): Promise<Result<{ ok: boolean }>> => {
    const window = windowFor(event);
    if (!window) return fail('WINDOW_NOT_FOUND', '窗口不存在');
    window.minimize();
    return ok({ ok: true });
  });

  ipcMain.handle(
    IPC_CHANNELS.windowToggleMaximize,
    async (event): Promise<Result<{ maximized: boolean }>> => {
      const window = windowFor(event);
      if (!window) return fail('WINDOW_NOT_FOUND', '窗口不存在');
      if (window.isMaximized()) window.unmaximize();
      else window.maximize();
      return ok({ maximized: window.isMaximized() });
    }
  );

  ipcMain.handle(IPC_CHANNELS.windowClose, async (event): Promise<Result<{ ok: boolean }>> => {
    const window = windowFor(event);
    if (!window) return fail('WINDOW_NOT_FOUND', '窗口不存在');
    window.close();
    return ok({ ok: true });
  });

  ipcMain.handle(
    IPC_CHANNELS.windowIsMaximized,
    async (event): Promise<Result<{ maximized: boolean }>> => {
      const window = windowFor(event);
      if (!window) return fail('WINDOW_NOT_FOUND', '窗口不存在');
      return ok({ maximized: window.isMaximized() });
    }
  );
};
