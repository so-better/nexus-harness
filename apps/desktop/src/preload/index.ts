/**
 * preload 唯一入口：通过 contextBridge 暴露类型化 API。
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { NexusBridge, SessionSummary, ThemeInfo } from '@shared/ipc/contracts';
import type { NexusEvent } from '@shared/events';

const bridge: NexusBridge = {
  app: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.appGetInfo)
  },
  session: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.sessionList),
    events: (id) => ipcRenderer.invoke(IPC_CHANNELS.sessionEvents, id),
    onChanged: (handler) => {
      const listener = (_event: IpcRendererEvent, session: SessionSummary) => handler(session);
      ipcRenderer.on(IPC_CHANNELS.sessionChanged, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.sessionChanged, listener);
    },
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.sessionCreate, input),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.sessionGet, id),
    rename: (input) => ipcRenderer.invoke(IPC_CHANNELS.sessionRename, input),
    setPinned: (input) => ipcRenderer.invoke(IPC_CHANNELS.sessionSetPinned, input),
    setModel: (input) => ipcRenderer.invoke(IPC_CHANNELS.sessionSetModel, input),
    setMode: (input) => ipcRenderer.invoke(IPC_CHANNELS.sessionSetMode, input),
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.sessionRemove, id),
    clearAll: () => ipcRenderer.invoke(IPC_CHANNELS.sessionClearAll),
    search: (query) => ipcRenderer.invoke(IPC_CHANNELS.sessionSearch, query)
  },
  settings: {
    getAutoLaunch: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGetAutoLaunch),
    setAutoLaunch: (enabled) => ipcRenderer.invoke(IPC_CHANNELS.settingsSetAutoLaunch, enabled),
    getLanguage: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGetLanguage),
    setLanguage: (language) => ipcRenderer.invoke(IPC_CHANNELS.settingsSetLanguage, language)
  },
  cache: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.cacheGetInfo),
    clear: (target) => ipcRenderer.invoke(IPC_CHANNELS.cacheClear, target)
  },
  provider: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.providerList),
    save: (input) => ipcRenderer.invoke(IPC_CHANNELS.providerSave, input),
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.providerRemove, id),
    test: (input) => ipcRenderer.invoke(IPC_CHANNELS.providerTest, input)
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
    answerUser: (input) => ipcRenderer.invoke(IPC_CHANNELS.agentAnswerUser, input),
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
