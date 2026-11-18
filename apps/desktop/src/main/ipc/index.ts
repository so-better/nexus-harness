/**
 * IPC 注册入口：按域聚合 handler，主进程启动时调用一次。
 */

import { registerAgentIpc } from './agent';
import { registerArtifactIpc } from './artifact';
import { registerCheckpointIpc } from './checkpoint';
import { registerAppIpc } from './app';
import { registerProviderIpc } from './provider';
import { registerSessionIpc } from './session';
import { registerSettingsIpc } from './settings';
import { registerThemeIpc } from './theme';
import { registerWorkspaceIpc } from './workspace';

/**
 * 注册全部主进程 IPC；后续按域在此追加。
 */
export const registerIpcHandlers = (): void => {
  registerAgentIpc();
  registerArtifactIpc();
  registerCheckpointIpc();
  registerAppIpc();
  registerProviderIpc();
  registerSessionIpc();
  registerSettingsIpc();
  registerThemeIpc();
  registerWorkspaceIpc();
};
