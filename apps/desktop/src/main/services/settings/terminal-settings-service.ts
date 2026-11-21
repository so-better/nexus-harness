/**
 * 终端设置应用服务：保存并广播给所有窗口，供设置页与 AI 工具共用。
 */
import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { TerminalSettings } from '@shared/ipc/contracts';
import { saveTerminalSettings } from './terminal-settings';

/**
 * 保存终端设置；保存成功后通知渲染层热更新。
 */
export const applyTerminalSettings = async (
  settings: TerminalSettings,
  settingsDir?: string
): Promise<TerminalSettings> => {
  const saved = await saveTerminalSettings(settings, settingsDir);
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.webContents.send(IPC_CHANNELS.terminalSettingsChanged, saved);
  }
  return saved;
};
