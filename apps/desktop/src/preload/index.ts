/* preload 唯一入口：通过 contextBridge 暴露类型化 API。 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { NexusBridge, ThemeInfo } from '@shared/ipc/contracts';

const bridge: NexusBridge = {
  app: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.appGetInfo)
  },
  theme: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.themeGetInfo),
    setSource: (source) => ipcRenderer.invoke(IPC_CHANNELS.themeSetSource, source),
    onChange: (handler) => {
      const listener = (_event: IpcRendererEvent, info: ThemeInfo): void => handler(info);
      ipcRenderer.on(IPC_CHANNELS.themeChanged, listener);

      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.themeChanged, listener);
      };
    }
  }
};

contextBridge.exposeInMainWorld('nexus', bridge);
