/* IPC 注册入口：按域聚合 handler，主进程启动时调用一次。 */

import { registerAppIpc } from './app';

/* 注册全部主进程 IPC；后续按域在此追加。 */
export const registerIpcHandlers = (): void => {
  registerAppIpc();
};
