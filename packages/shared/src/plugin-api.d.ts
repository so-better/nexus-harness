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

export interface PluginQuickPickItem {
  id: string;
  title: string;
  description?: string;
  run: () => void | Promise<void>;
}

export type PluginQuickPickProvider = () => PluginQuickPickItem[] | Promise<PluginQuickPickItem[]>;

export interface PluginNetResponse {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  text: string;
}

export interface PluginNetRequestInit {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
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
  /** 本条助手消息的生成耗时（毫秒）；流式期间不提供 */
  durationMs?: number;
  /** 本条助手消息正文的字符数（Unicode 码点）；流式期间不提供 */
  contentChars?: number;
  model?: string;
}

export interface PluginStatusBarItem {
  id: string;
  text: string;
  align?: 'left' | 'right';
  title?: string;
  /** AppIcon 名称（可选） */
  icon?: string;
  onClick?: () => void;
}

export type PluginSkinMount = (element: HTMLElement, ctx: PluginContext) => Disposable;
export type PluginStartupMount = (
  element: HTMLElement,
  ctx: PluginContext,
  finish: () => void
) => Disposable;
export type PluginViewMount = (element: HTMLElement, ctx: PluginContext) => Disposable;
export type PluginSlotMount = (element: HTMLElement, context: PluginSlotContext) => Disposable;

export interface PluginEventMeta {
  type: string;
  sessionId: string;
  runId?: string;
  ts: number;
  /**
   * 子代理事件所属父级 task 工具调用；父会话事件为 undefined。
   * 插件可据此过滤或单独统计子代理内部事件。
   */
  parentToolCallId?: string;
}

export type PluginUsageBucket = 'day' | 'hour' | 'run';

export interface PluginUsageQuery {
  from?: number | undefined;
  to?: number | undefined;
  sessionId?: string | undefined;
  bucket?: PluginUsageBucket | undefined;
}

export interface PluginUsageTotals {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  cost: number;
  calls: number;
}

export interface PluginUsageSeriesPoint extends PluginUsageTotals {
  key: string;
  start: number;
}

export interface PluginUsageBreakdown extends PluginUsageTotals {
  key: string;
  label: string;
}

export interface PluginUsageSession extends PluginUsageTotals {
  sessionId: string;
  title: string;
  lastUsedAt: number;
}

/**
 * 会话的上下文占用快照：仅在按 sessionId 查询用量时返回。
 * contextTokens 取最近一次主对话模型调用的输入 token 数，可近似视为当前上下文占用。
 */
export interface PluginUsageContext {
  providerId?: string;
  modelId?: string;
  /** 模型上下文窗口；未知时为 0 */
  contextWindow: number;
  /** 模型单次输出上限（max_tokens） */
  maxOutputTokens: number;
  /** 当前上下文占用（最近一次主对话调用的输入 token） */
  contextTokens: number;
  /** 上下文构成估算：系统提示 / 工具 schema / 历史消息 token */
  breakdown?: {
    systemTokens: number;
    toolsTokens: number;
    historyTokens: number;
  };
}

export interface PluginUsageStats {
  totals: PluginUsageTotals;
  series: PluginUsageSeriesPoint[];
  sessions: PluginUsageSession[];
  models: PluginUsageBreakdown[];
  providers: PluginUsageBreakdown[];
  /** 会话上下文占用快照；仅按 sessionId 查询且可解析模型时返回 */
  context?: PluginUsageContext;
}

export interface PluginContext {
  pluginId: string;
  commands: {
    register: (id: string, handler: () => void | Promise<void>) => Disposable;
    /** 命令面板打开时收集的动态条目 */
    registerProvider: (id: string, provider: PluginQuickPickProvider) => Disposable;
  };
  views: {
    register: (id: string, mount: PluginViewMount) => Disposable;
    open: (id: string) => Promise<void>;
  };
  slots: {
    register: (id: string, mount: PluginSlotMount) => Disposable;
  };
  skins: {
    register: (id: string, mount: PluginSkinMount) => Disposable;
  };
  startup: {
    register: (id: string, mount: PluginStartupMount) => Disposable;
  };
  statusBar: {
    add: (item: PluginStatusBarItem) => Disposable;
  };
  events: {
    on: (event: string, handler: (payload: unknown, meta: PluginEventMeta) => void) => Disposable;
  };
  storage: {
    get: <T>(key: string) => Promise<T | undefined>;
    set: <T>(key: string, value: T) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
  settings: Record<string, PluginSettingValue>;
  usage: {
    getStats: (input?: PluginUsageQuery) => Promise<PluginUsageStats>;
  };
  logger: {
    debug: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };
  notifications: {
    /** 系统（桌面）通知 */
    show: (message: string, level?: 'info' | 'warning' | 'error') => void;
    /** 应用内消息提示（toast） */
    message: (message: string, level?: 'info' | 'warning' | 'error') => void;
  };
  workspace: {
    readFile: (path: string) => Promise<string>;
    list: (dir?: string) => Promise<PluginWorkspaceEntry[]>;
  };
  /** 受控网络；仅能访问 manifest.network.hosts 白名单域名 */
  net: {
    fetch: (url: string, init?: PluginNetRequestInit) => Promise<PluginNetResponse>;
  };
  /** 加密密钥存储（系统安全存储）；按插件隔离 */
  secrets: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
  /** 后台任务：最小 5s 间隔，插件停用时清理 */
  jobs: {
    every: (intervalMs: number, handler: () => void | Promise<void>) => Disposable;
  };
  /** 输入区：插入文本到当前输入框 */
  composer: {
    insert: (text: string) => void;
  };
}

export interface PluginModule {
  activate: (ctx: PluginContext) => void | Promise<void>;
  deactivate?: () => void | Promise<void>;
}
