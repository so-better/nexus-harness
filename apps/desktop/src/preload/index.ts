/**
 * preload 唯一入口：通过 contextBridge 暴露类型化 API。
 */

import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type {
  NexusBridge,
  SessionSummary,
  TerminalEvent,
  TerminalSettings,
  ThemeInfo
} from '@shared/ipc/contracts';
import type { NexusEvent } from '@shared/events';

const bridge: NexusBridge = {
  app: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.appGetInfo),
    openExternal: (url) => ipcRenderer.invoke(IPC_CHANNELS.appOpenExternal, url),
    openPath: (path) => ipcRenderer.invoke(IPC_CHANNELS.appOpenPath, path)
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
    roots: (id) => ipcRenderer.invoke(IPC_CHANNELS.sessionRoots, id),
    addRoots: (input) => ipcRenderer.invoke(IPC_CHANNELS.sessionAddRoots, input),
    removeRoot: (input) => ipcRenderer.invoke(IPC_CHANNELS.sessionRemoveRoot, input),
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
    diff: (input) => ipcRenderer.invoke(IPC_CHANNELS.checkpointDiff, input),
    openFile: (input) => ipcRenderer.invoke(IPC_CHANNELS.checkpointOpenFile, input),
    restore: (input) => ipcRenderer.invoke(IPC_CHANNELS.checkpointRestore, input)
  },
  artifact: {
    read: (input) => ipcRenderer.invoke(IPC_CHANNELS.artifactRead, input)
  },
  files: {
    saveAs: (input) => ipcRenderer.invoke(IPC_CHANNELS.filesSaveAs, input)
  },
  workspace: {
    chooseRoot: (input) => ipcRenderer.invoke(IPC_CHANNELS.workspaceChooseRoot, input),
    searchFiles: (input) => ipcRenderer.invoke(IPC_CHANNELS.workspaceSearchFiles, input)
  },
  approval: {
    resolve: (input) => ipcRenderer.invoke(IPC_CHANNELS.approvalResolve, input)
  },
  terminal: {
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.terminalCreate, input),
    write: (input) => ipcRenderer.invoke(IPC_CHANNELS.terminalWrite, input),
    resize: (input) => ipcRenderer.invoke(IPC_CHANNELS.terminalResize, input),
    close: (input) => ipcRenderer.invoke(IPC_CHANNELS.terminalClose, input),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.terminalList),
    busy: (input) => ipcRenderer.invoke(IPC_CHANNELS.terminalBusy, input),
    selectDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.terminalSelectDirectory),
    selectShell: () => ipcRenderer.invoke(IPC_CHANNELS.terminalSelectShell),
    currentDirectory: (id) => ipcRenderer.invoke(IPC_CHANNELS.terminalCurrentDirectory, id),
    updateTitle: (id, title, custom) =>
      ipcRenderer.invoke(IPC_CHANNELS.terminalUpdateTitle, { id, title, custom }),
    reorder: (ids) => ipcRenderer.invoke(IPC_CHANNELS.terminalReorder, ids),
    getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.terminalGetSettings),
    getShellInfo: () => ipcRenderer.invoke(IPC_CHANNELS.terminalGetShellInfo),
    setSettings: (settings) => ipcRenderer.invoke(IPC_CHANNELS.terminalSetSettings, settings),
    onSettingsChanged: (handler) => {
      const listener = (_event: IpcRendererEvent, settings: TerminalSettings): void =>
        handler(settings);
      ipcRenderer.on(IPC_CHANNELS.terminalSettingsChanged, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.terminalSettingsChanged, listener);
      };
    },
    readClipboard: () => ipcRenderer.invoke(IPC_CHANNELS.terminalReadClipboard),
    writeClipboard: (text) => ipcRenderer.invoke(IPC_CHANNELS.terminalWriteClipboard, text),
    getPathForFile: (file) => webUtils.getPathForFile(file as File),
    onEvent: (handler) => {
      const listener = (_event: IpcRendererEvent, payload: TerminalEvent): void => handler(payload);
      ipcRenderer.on(IPC_CHANNELS.terminalEvent, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.terminalEvent, listener);
      };
    }
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
