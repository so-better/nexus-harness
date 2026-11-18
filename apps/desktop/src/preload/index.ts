/**
 * preload 唯一入口：通过 contextBridge 暴露类型化 API。
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { NexusBridge, ThemeInfo } from '@shared/ipc/contracts';
import type { NexusEvent } from '@shared/events';

const bridge: NexusBridge = {
  app: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.appGetInfo)
  },
  session: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.sessionList),
    events: (id) => ipcRenderer.invoke(IPC_CHANNELS.sessionEvents, id),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.sessionCreate, input),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.sessionGet, id),
    rename: (input) => ipcRenderer.invoke(IPC_CHANNELS.sessionRename, input),
    setPinned: (input) => ipcRenderer.invoke(IPC_CHANNELS.sessionSetPinned, input),
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.sessionRemove, id)
  },
  provider: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.providerList),
    save: (input) => ipcRenderer.invoke(IPC_CHANNELS.providerSave, input),
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.providerRemove, id)
  },
  checkpoint: {
    restore: (input) => ipcRenderer.invoke(IPC_CHANNELS.checkpointRestore, input)
  },
  artifact: {
    read: (input) => ipcRenderer.invoke(IPC_CHANNELS.artifactRead, input)
  },
  workspace: {
    chooseRoot: () => ipcRenderer.invoke(IPC_CHANNELS.workspaceChooseRoot)
  },
  approval: {
    resolve: (input) => ipcRenderer.invoke(IPC_CHANNELS.approvalResolve, input)
  },
  agent: {
    run: (input) => ipcRenderer.invoke(IPC_CHANNELS.agentRun, input),
    cancel: (runId) => ipcRenderer.invoke(IPC_CHANNELS.agentCancel, runId),
    onEvent: (handler) => {
      const listener = (_event: IpcRendererEvent, event: NexusEvent): void => handler(event);
      ipcRenderer.on(IPC_CHANNELS.agentEvent, listener);

      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.agentEvent, listener);
      };
    }
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
