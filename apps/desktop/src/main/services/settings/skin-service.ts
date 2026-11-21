/**
 * 皮肤应用服务：持久化选择并广播给所有窗口，供 AI 与设置页共用。
 */
import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { PluginSkinChangedPayload, PluginSkinSelection } from '@shared/plugin';
import { saveSkinSelection } from './skin-settings';

/**
 * 保存皮肤选择并通知渲染层立即重挂载或清除皮肤。
 */
export const applySkinSelection = async (
  selection: PluginSkinSelection | null,
  settingsDir?: string,
  source: PluginSkinChangedPayload['source'] = 'settings'
): Promise<PluginSkinSelection | null> => {
  const saved = await saveSkinSelection(selection, settingsDir);
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.webContents.send(IPC_CHANNELS.settingsSkinChanged, {
      selection: saved,
      source
    } satisfies PluginSkinChangedPayload);
  }
  return saved;
};
