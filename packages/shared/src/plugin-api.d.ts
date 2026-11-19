/**
 * 插件作者使用的独立类型声明。
 * 仅用于复制到插件项目获得类型提示，不参与运行时，也不得导入内部包。
 */

export type Disposable = () => void;

export type PluginSettingValue = string | number | boolean | null;

export interface PluginWorkspaceEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
}

export interface PluginUsageSummary {
  inputTokens: number;
  outputTokens: number;
  cost?: number;
}

export interface PluginSlotContext {
  location: string;
  sessionId?: string;
  runId?: string;
  messageId?: string;
  role?: 'user' | 'assistant';
  toolCallId?: string;
  approvalId?: string;
  fileId?: string;
  usage?: PluginUsageSummary;
  model?: string;
}

export interface PluginStatusBarItem {
  id: string;
  text: string;
  align?: 'left' | 'right';
  title?: string;
  onClick?: () => void;
}

export type PluginSkinMount = (element: HTMLElement, ctx: PluginContext) => Disposable;
export type PluginViewMount = (element: HTMLElement, ctx: PluginContext) => Disposable;
export type PluginSlotMount = (element: HTMLElement, context: PluginSlotContext) => Disposable;

export interface PluginContext {
  pluginId: string;
  commands: {
    register: (id: string, handler: () => void | Promise<void>) => Disposable;
  };
  views: {
    register: (id: string, mount: PluginViewMount) => Disposable;
  };
  slots: {
    register: (id: string, mount: PluginSlotMount) => Disposable;
  };
  skins: {
    register: (id: string, mount: PluginSkinMount) => Disposable;
  };
  statusBar: {
    add: (item: PluginStatusBarItem) => Disposable;
  };
  events: {
    on: (event: string, handler: (payload: unknown) => void) => Disposable;
  };
  storage: {
    get: <T>(key: string) => Promise<T | undefined>;
    set: <T>(key: string, value: T) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
  settings: Record<string, PluginSettingValue>;
  logger: {
    debug: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };
  notifications: {
    show: (message: string, level?: 'info' | 'warning' | 'error') => void;
  };
  workspace: {
    readFile: (path: string) => Promise<string>;
    list: (dir?: string) => Promise<PluginWorkspaceEntry[]>;
  };
}

export interface PluginModule {
  activate: (ctx: PluginContext) => void | Promise<void>;
  deactivate?: () => void | Promise<void>;
}
