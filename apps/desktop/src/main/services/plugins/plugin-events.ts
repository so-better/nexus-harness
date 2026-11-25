/**
 * 领域事件广播：插件走独立的 `plugin:event` 通道，聊天缓存走 `agent:event`。
 * 广播是尽力而为：窗口不可用或发送失败都不能影响主流程。
 */
import { BrowserWindow } from 'electron';
import type { NexusEvent } from '@shared/events';
import { IPC_CHANNELS } from '@shared/ipc/channels';

const sendToWindows = (channel: string, event: NexusEvent): void => {
  try {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.webContents.isDestroyed()) {
        window.webContents.send(channel, event);
      }
    }
  } catch {
    // Electron 不可用（如测试环境）或窗口关闭竞态：忽略
  }
};

/**
 * 广播给渲染层插件事件通道（独立于 agent 事件，避免与聊天缓存耦合）。
 */
export const broadcastPluginEvent = (event: NexusEvent): void => {
  sendToWindows(IPC_CHANNELS.pluginEvent, event);
};

/**
 * 广播给渲染层 agent 事件通道；仅用于会话删除等需要清理聊天缓存的场景。
 */
export const broadcastAgentEvent = (event: NexusEvent): void => {
  sendToWindows(IPC_CHANNELS.agentEvent, event);
};
