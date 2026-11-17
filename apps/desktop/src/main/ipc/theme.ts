/* 主题 IPC：读取/切换主题来源，并在系统主题变化时通知所有窗口。 */

import { BrowserWindow, ipcMain, nativeTheme } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { themeSourceSchema, type ThemeInfo } from '@shared/ipc/contracts';
import { fail, ok, type Result } from '@shared/ipc/result';
import { applyWindowBackground, getThemeInfo } from '../app/theme';

/* 将当前主题同步到窗口背景与渲染进程。 */
const broadcastTheme = (): void => {
  const info = getThemeInfo();

  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    applyWindowBackground(window);
    window.webContents.send(IPC_CHANNELS.themeChanged, info);
  }
};

/* 注册主题相关 IPC；系统主题变化同样走这里广播。 */
export const registerThemeIpc = (): void => {
  ipcMain.handle(IPC_CHANNELS.themeGetInfo, async (): Promise<Result<ThemeInfo>> => ok(getThemeInfo()));

  ipcMain.handle(
    IPC_CHANNELS.themeSetSource,
    async (_event, rawSource: unknown): Promise<Result<ThemeInfo>> => {
      const parsed = themeSourceSchema.safeParse(rawSource);
      if (!parsed.success) {
        return fail('THEME_INVALID_SOURCE', '无效的主题来源', parsed.error.flatten());
      }

      nativeTheme.themeSource = parsed.data;
      broadcastTheme();
      return ok(getThemeInfo());
    }
  );

  nativeTheme.on('updated', broadcastTheme);
};
