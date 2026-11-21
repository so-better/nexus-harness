/**
 * 主题 IPC：读取/切换主题来源，并在系统主题变化时通知所有窗口。
 */

import { ipcMain, nativeTheme } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { themeSourceSchema, type ThemeInfo } from '@shared/ipc/contracts';
import { fail, ok, type Result } from '@shared/ipc/result';
import { getThemeInfo } from '../app/theme';
import { applyThemeSource, broadcastTheme } from '../services/settings/theme-service';

/**
 * 注册主题相关 IPC；系统主题变化同样走这里广播。
 */
export const registerThemeIpc = (): void => {
  ipcMain.handle(IPC_CHANNELS.themeGetInfo, async (): Promise<Result<ThemeInfo>> =>
    ok(getThemeInfo())
  );

  ipcMain.handle(
    IPC_CHANNELS.themeSetSource,
    async (_event, rawSource: unknown): Promise<Result<ThemeInfo>> => {
      const parsed = themeSourceSchema.safeParse(rawSource);
      if (!parsed.success) {
        return fail('THEME_INVALID_SOURCE', '无效的主题来源', parsed.error.flatten());
      }

      try {
        return ok(await applyThemeSource(parsed.data));
      } catch (error) {
        console.error('主题设置保存失败', error);
        return fail('THEME_PERSIST_FAILED', '主题设置保存失败');
      }
    }
  );

  nativeTheme.on('updated', broadcastTheme);
};
