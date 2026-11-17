/* preload 唯一入口：通过 contextBridge 暴露类型化 API。 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { NexusBridge } from '@shared/ipc/contracts';

const bridge: NexusBridge = {
  app: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.appGetInfo)
  }
};

contextBridge.exposeInMainWorld('nexus', bridge);
