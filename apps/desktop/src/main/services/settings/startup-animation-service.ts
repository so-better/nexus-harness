/**
 * 启动动画选择服务：持久化选择并广播给所有窗口。
 */
import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { PluginStartupChangedPayload, PluginStartupSelection } from '@shared/plugin';
import { saveStartupSelection } from './startup-animation-settings';

/**
 * 保存启动动画选择并通知渲染层更新选择状态。
 */
export const applyStartupSelection = async (
  selection: PluginStartupSelection | null,
  settingsDir?: string,
  source: PluginStartupChangedPayload['source'] = 'settings'
): Promise<PluginStartupSelection | null> => {
  const saved = await saveStartupSelection(selection, settingsDir);
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.webContents.send(IPC_CHANNELS.settingsStartupChanged, {
      selection: saved,
      source
    } satisfies PluginStartupChangedPayload);
  }
  return saved;
};
