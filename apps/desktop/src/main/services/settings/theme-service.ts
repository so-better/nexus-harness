/**
 * 主题应用服务：持久化主题来源、更新 nativeTheme 并广播到所有窗口。
 */
import { BrowserWindow, nativeTheme } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { ThemeInfo, ThemeSource } from '@shared/ipc/contracts';
import { applyWindowBackground, getThemeInfo } from '../../app/theme';
import { saveThemeSource } from './theme-settings';

let lastThemeSignature: string | null = null;

/**
 * 广播当前主题；重复状态不重复发送。
 */
export const broadcastTheme = (): ThemeInfo => {
  const info = getThemeInfo();
  const signature = `${info.source}:${info.effective}`;
  if (signature === lastThemeSignature) return info;
  lastThemeSignature = signature;

  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    applyWindowBackground(window);
    window.webContents.send(IPC_CHANNELS.themeChanged, info);
  }
  return info;
};

/**
 * 保存并应用主题来源；调用方负责处理持久化异常。
 */
export const applyThemeSource = async (
  source: ThemeSource,
  settingsDir?: string
): Promise<ThemeInfo> => {
  if (settingsDir) await saveThemeSource(source, settingsDir);
  else await saveThemeSource(source);
  nativeTheme.themeSource = source;
  return broadcastTheme();
};
