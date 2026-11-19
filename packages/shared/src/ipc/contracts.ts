/**
 * 跨进程契约：应用级 IPC 的 zod schema 与 preload 桥接类型。
 */

import { z } from 'zod';
import { messageFileReferenceSchema, type NexusEvent } from '../events';
import type { AskUserResolveInput, AskUserResolveResult } from '../ask-user';
import type {
  PluginPublic,
  PluginSettingValue,
  PluginSkinSelection,
  PluginWorkspaceEntry
} from '../plugin';
import type { Result } from './result';
import type { McpTestResult } from '../mcp';
import type { ImageSettings } from '../image';
import type { SearchSettings } from '../search';
import type { SkillDetail, SkillSummary } from '../skills';

/**
 * 应用基础信息，用于确认渲染进程与主进程通道可用。
 */
export const appInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  platform: z.string()
});

export type AppInfo = z.infer<typeof appInfoSchema>;

/**
 * 主题来源：跟随系统、强制浅色或强制深色。
 */
export const themeSourceSchema = z.enum(['system', 'light', 'dark']);

/**
 * 主题状态：source 为用户选择，effective 为当前实际生效主题。
 */
export const themeInfoSchema = z.object({
  source: themeSourceSchema,
  effective: z.enum(['light', 'dark'])
});

export type ThemeSource = z.infer<typeof themeSourceSchema>;
export type ThemeInfo = z.infer<typeof themeInfoSchema>;

/**
 * Provider 协议：OpenAI 兼容、Anthropic 原生或 Ollama。
 */
export const providerProtocolSchema = z.enum(['openai', 'anthropic', 'ollama']);

/**
 * Provider 下的单个模型配置。
 */
export const providerModelSchema = z
  .object({
    id: z.string().min(1),
    role: z.enum(['chat', 'image']).optional(),
    endpoint: z.string().url().optional(),
    contextWindow: z.number().int().min(4_096).max(2_000_000),
    maxOutputTokens: z.number().int().min(256).max(131_072)
  })
  .refine((value) => value.maxOutputTokens < value.contextWindow, {
    message: 'maxOutputTokens 必须小于 contextWindow',
    path: ['maxOutputTokens']
  });

/**
 * Provider 保存参数；一个 Provider 可以包含多个模型。
 */
export const providerSettingsSchema = z
  .object({
    id: z.string().optional(),
    protocol: providerProtocolSchema.optional(),
    name: z.string().min(1),
    baseUrl: z.string().min(1),
    apiKey: z.string().min(1).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    extraParams: z.record(z.string(), z.unknown()).optional(),
    enabled: z.boolean().optional(),
    models: z.array(providerModelSchema).min(1),
    defaultModelId: z.string().min(1)
  })
  .refine((value) => value.models.some((model) => model.id === value.defaultModelId), {
    message: '默认模型必须存在于模型列表中',
    path: ['defaultModelId']
  });

/**
 * 对外展示的 Provider 配置；本地桌面应用直接回显 API Key。
 */
export const providerPublicSchema = z.object({
  id: z.string().min(1),
  protocol: providerProtocolSchema,
  name: z.string().min(1),
  baseUrl: z.string().min(1),
  apiKey: z.string(),
  enabled: z.boolean(),
  models: z.array(providerModelSchema).min(1),
  defaultModelId: z.string().min(1)
});

/**
 * 主进程内部使用的完整 Provider 配置；headers/extraParams 视为敏感字段。
 */
export const agentProviderConfigSchema = providerPublicSchema.extend({
  headers: z.record(z.string(), z.string()).optional(),
  extraParams: z.record(z.string(), z.unknown()).optional()
});

export const providerRemoveResultSchema = z.object({ id: z.string().min(1) });

/**
 * 测试连接：允许未保存的新配置；已有配置可省略 apiKey。
 */
export const providerTestInputSchema = z.object({
  id: z.string().min(1).optional(),
  protocol: providerProtocolSchema.optional(),
  baseUrl: z.string().min(1),
  apiKey: z.string().min(1).optional(),
  headers: z.record(z.string(), z.string()).optional()
});

export const providerProbeResultSchema = z.object({
  models: z.array(z.string()),
  latencyMs: z.number().nonnegative()
});

export type ProviderProtocol = z.infer<typeof providerProtocolSchema>;
export type ProviderModel = z.infer<typeof providerModelSchema>;
export type ProviderProbeResult = z.infer<typeof providerProbeResultSchema>;
export type ProviderTestInput = z.infer<typeof providerTestInputSchema>;

/**
 * 取消订阅函数，preload 与插件 API 共用。
 */
export type Unsubscribe = () => void;

/**
 * preload 暴露到 window.nexus 的桥接接口。
 */
export interface NexusBridge {
  app: {
    getInfo: () => Promise<Result<AppInfo>>;
    openExternal: (url: string) => Promise<Result<{ opened: boolean }>>;
    openPath: (path: string) => Promise<Result<{ opened: boolean }>>;
    consumePendingSession: () => Promise<Result<string | null>>;
  };
  window: {
    minimize: () => Promise<Result<{ ok: boolean }>>;
    toggleMaximize: () => Promise<Result<{ maximized: boolean }>>;
    close: () => Promise<Result<{ ok: boolean }>>;
    isMaximized: () => Promise<Result<{ maximized: boolean }>>;
    onMaximizedChange: (handler: (maximized: boolean) => void) => Unsubscribe;
  };
  theme: {
    getInfo: () => Promise<Result<ThemeInfo>>;
    setSource: (source: ThemeSource) => Promise<Result<ThemeInfo>>;
    onChange: (handler: (info: ThemeInfo) => void) => Unsubscribe;
  };
  settings: {
    getAutoLaunch: () => Promise<Result<boolean>>;
    getNotificationBadge: () => Promise<Result<NotificationBadgeStyle>>;
    setNotificationBadge: (
      style: NotificationBadgeStyle
    ) => Promise<Result<NotificationBadgeStyle>>;
    getSkin: () => Promise<Result<PluginSkinSelection | null>>;
    getImage: () => Promise<Result<ImageSettings | null>>;
    setImage: (value: ImageSettings) => Promise<Result<ImageSettings>>;
    getSearch: () => Promise<Result<SearchSettings | null>>;
    setSearch: (value: SearchSettings) => Promise<Result<SearchSettings>>;
    setSkin: (selection: PluginSkinSelection | null) => Promise<Result<PluginSkinSelection | null>>;
    setAutoLaunch: (enabled: boolean) => Promise<Result<boolean>>;
    getLanguage: () => Promise<Result<AppLanguage>>;
    setLanguage: (language: AppLanguage) => Promise<Result<AppLanguage>>;
  };
  cache: {
    getInfo: () => Promise<Result<CacheInfo>>;
    clear: (target: CacheTarget) => Promise<Result<CacheInfo>>;
  };
  provider: {
    list: () => Promise<Result<ProviderPublic[]>>;
    save: (input: ProviderSettings) => Promise<Result<ProviderPublic>>;
    remove: (id: string) => Promise<Result<ProviderRemoveResult>>;
    test: (input: ProviderTestInput) => Promise<Result<ProviderProbeResult>>;
  };
  session: {
    list: () => Promise<Result<SessionSummary[]>>;
    events: (id: string) => Promise<Result<NexusEvent[]>>;
    onChanged: (handler: (session: SessionSummary) => void) => Unsubscribe;
    onRootsChanged: (handler: (sessionId: string) => void) => Unsubscribe;
    create: (input: SessionCreateInput) => Promise<Result<SessionSummary>>;
    get: (id: string) => Promise<Result<SessionSummary>>;
    rename: (input: SessionRenameInput) => Promise<Result<SessionSummary>>;
    setPinned: (input: SessionSetPinnedInput) => Promise<Result<SessionSummary>>;
    setModel: (input: SessionSetModelInput) => Promise<Result<SessionSummary>>;
    setMode: (input: SessionSetModeInput) => Promise<Result<SessionSummary>>;
    roots: (id: string) => Promise<Result<SessionRoot[]>>;
    addRoots: (input: SessionAddRootsInput) => Promise<Result<SessionRoot[]>>;
    removeRoot: (input: SessionRemoveRootInput) => Promise<Result<SessionRoot[]>>;
    remove: (id: string) => Promise<Result<SessionRemoveResult>>;
    clearAll: () => Promise<Result<SessionClearAllResult>>;
    search: (query: string) => Promise<Result<SessionSearchResult[]>>;
    export: (input: SessionExportInput) => Promise<Result<SessionExportResult>>;
    onActivate: (handler: (sessionId: string) => void) => Unsubscribe;
  };
  checkpoint: {
    diff: (input: CheckpointDiffInput) => Promise<Result<CheckpointDiffResult>>;
    openFile: (input: CheckpointOpenInput) => Promise<Result<CheckpointOpenResult>>;
    restore: (input: CheckpointRestoreInput) => Promise<Result<CheckpointRestoreResult>>;
  };
  artifact: {
    read: (input: ArtifactReadInput) => Promise<Result<ArtifactReadResult>>;
  };
  files: {
    saveAs: (input: FileSaveAsInput) => Promise<Result<FileSaveAsResult>>;
    read: (input: FileReadInput) => Promise<Result<FileReadResult>>;
  };
  workspace: {
    chooseRoot: (input?: WorkspaceChooseRootInput) => Promise<Result<WorkspaceRootSelection>>;
    searchFiles: (input: WorkspaceFileSearchInput) => Promise<Result<WorkspaceFileReference[]>>;
    onAuthorizationRequested: (
      handler: (request: WorkspaceAuthorizationRequest) => void
    ) => Unsubscribe;
    resolveAuthorization: (
      input: WorkspaceAuthorizationResolveInput
    ) => Promise<Result<{ resolved: boolean }>>;
    onAuthorizationSettled: (
      handler: (settled: WorkspaceAuthorizationSettled) => void
    ) => Unsubscribe;
  };
  approval: {
    resolve: (input: ApprovalResolveInput) => Promise<Result<ApprovalResolveResult>>;
  };
  plugin: {
    list: () => Promise<Result<PluginPublic[]>>;
    setEnabled: (id: string, enabled: boolean) => Promise<Result<PluginPublic[]>>;
    reload: () => Promise<Result<PluginPublic[]>>;
    importFromDirectory: () => Promise<Result<PluginPublic[] | null>>;
    uninstall: (id: string) => Promise<Result<PluginPublic[]>>;
    onChanged: (handler: (plugins: PluginPublic[]) => void) => Unsubscribe;
    storageGet: (pluginId: string, key: string) => Promise<Result<unknown>>;
    storageSet: (pluginId: string, key: string, value: unknown) => Promise<Result<{ ok: boolean }>>;
    storageDelete: (pluginId: string, key: string) => Promise<Result<{ ok: boolean }>>;
    settingsGet: (pluginId: string) => Promise<Result<Record<string, PluginSettingValue>>>;
    settingsSet: (
      pluginId: string,
      values: Record<string, PluginSettingValue>
    ) => Promise<Result<Record<string, PluginSettingValue>>>;
    log: (
      pluginId: string,
      level: 'debug' | 'info' | 'warn' | 'error',
      message: string
    ) => Promise<Result<{ ok: boolean }>>;
    notify: (
      pluginId: string,
      message: string,
      level?: 'info' | 'warning' | 'error'
    ) => Promise<Result<{ ok: boolean }>>;
    reportError: (pluginId: string, error: string) => Promise<Result<{ ok: boolean }>>;
    workspaceRead: (pluginId: string, sessionId: string, path: string) => Promise<Result<string>>;
    workspaceList: (
      pluginId: string,
      sessionId: string,
      path?: string
    ) => Promise<Result<PluginWorkspaceEntry[]>>;
  };
  mcp: {
    load: () => Promise<Result<string>>;
    save: (text: string) => Promise<Result<{ ok: boolean }>>;
    test: (text: string) => Promise<Result<McpTestResult>>;
  };
  skills: {
    list: () => Promise<Result<SkillSummary[]>>;
    read: (name: string) => Promise<Result<SkillDetail>>;
    importDirectory: () => Promise<Result<SkillSummary[] | null>>;
    delete: (id: string) => Promise<Result<SkillSummary[]>>;
  };
  terminal: {
    create: (input: TerminalCreateInput) => Promise<Result<TerminalSessionPublic>>;
    write: (input: TerminalWriteInput) => Promise<Result<{ ok: boolean }>>;
    resize: (input: TerminalResizeInput) => Promise<Result<{ ok: boolean }>>;
    close: (input: TerminalCloseInput) => Promise<Result<{ closed: boolean }>>;
    list: () => Promise<Result<TerminalSessionPublic[]>>;
    busy: (input: TerminalBusyInput) => Promise<Result<TerminalBusyResult>>;
    selectDirectory: () => Promise<Result<{ path?: string }>>;
    selectShell: () => Promise<Result<{ path?: string }>>;
    currentDirectory: (id: string) => Promise<Result<{ cwd: string | null }>>;
    updateTitle: (id: string, title: string, custom: boolean) => Promise<Result<{ ok: boolean }>>;
    reorder: (ids: string[]) => Promise<Result<{ ok: boolean }>>;
    getSettings: () => Promise<Result<TerminalSettings>>;
    getShellInfo: () => Promise<Result<TerminalShellInfo>>;
    setSettings: (settings: TerminalSettings) => Promise<Result<TerminalSettings>>;
    onSettingsChanged: (handler: (settings: TerminalSettings) => void) => Unsubscribe;
    readClipboard: () => Promise<Result<string>>;
    writeClipboard: (text: string) => Promise<Result<{ ok: boolean }>>;
    getPathForFile: (file: unknown) => string;
    onEvent: (handler: (event: TerminalEvent) => void) => Unsubscribe;
  };
  agent: {
    run: (input: AgentRunInput) => Promise<Result<AgentStartResult>>;
    cancel: (runId: string) => Promise<Result<AgentCancelResult>>;
    cancelSession: (sessionId: string) => Promise<Result<AgentCancelResult>>;
    onEvent: (handler: (event: NexusEvent) => void) => Unsubscribe;
    answerUser: (input: AskUserResolveInput) => Promise<Result<AskUserResolveResult>>;
  };
}

/**
 * 内置终端：会话级 PTY，不依赖外部终端窗口。
 */
export const terminalSessionPublicSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  title: z.string().min(1),
  cwd: z.string().min(1),
  shell: z.string().min(1),
  customTitle: z.boolean(),
  pid: z.number().int().positive(),
  status: z.enum(['running', 'exited', 'closed']),
  exitCode: z.number().int().nullable().optional(),
  source: z.enum(['user', 'ai']),
  createdAt: z.number().nonnegative()
});

export const terminalCreateInputSchema = z.object({
  sessionId: z.string().min(1),
  cwd: z.string().min(1).optional(),
  cols: z.number().int().min(2).max(500).optional(),
  rows: z.number().int().min(1).max(300).optional()
});

export const terminalWriteInputSchema = z.object({
  id: z.string().min(1),
  data: z.string().max(1_000_000)
});

export const terminalResizeInputSchema = z.object({
  id: z.string().min(1),
  cols: z.number().int().min(2).max(500),
  rows: z.number().int().min(1).max(300)
});

export const terminalCloseInputSchema = z.object({ id: z.string().min(1) });
export const terminalBusyInputSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(64)
});
export const terminalBusyResultSchema = z.object({
  busy: z.array(z.string().min(1))
});

export const terminalSettingsSchema = z.object({
  shell: z.string().nullable(),
  fontSize: z.number().int().min(9).max(32),
  scrollback: z.number().int().min(1000).max(100_000),
  copyOnSelect: z.boolean(),
  webgl: z.boolean()
});

export type TerminalSettings = z.infer<typeof terminalSettingsSchema>;

export const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  shell: null,
  fontSize: 12,
  scrollback: 5000,
  copyOnSelect: false,
  webgl: true
};
export const terminalShellInfoSchema = z.object({
  path: z.string().min(1),
  available: z.boolean(),
  source: z.enum(['settings', 'environment', 'auto']),
  name: z.string().min(1)
});

export type TerminalShellInfo = z.infer<typeof terminalShellInfoSchema>;
export type TerminalSessionPublic = z.infer<typeof terminalSessionPublicSchema>;
export type TerminalCreateInput = z.infer<typeof terminalCreateInputSchema>;
export type TerminalWriteInput = z.infer<typeof terminalWriteInputSchema>;
export type TerminalResizeInput = z.infer<typeof terminalResizeInputSchema>;
export type TerminalCloseInput = z.infer<typeof terminalCloseInputSchema>;
export type TerminalBusyInput = z.infer<typeof terminalBusyInputSchema>;
export type TerminalBusyResult = z.infer<typeof terminalBusyResultSchema>;

export type TerminalEvent =
  | { type: 'created'; terminal: TerminalSessionPublic }
  | { type: 'data'; id: string; data: string }
  | { type: 'exit'; id: string; exitCode: number | null; status: 'exited' }
  | { type: 'closed'; id: string; sessionId: string };

/**
 * Agent 运行只引用已保存的 Provider，避免渲染进程直接传 API Key。
 */
export const agentRunInputSchema = z.object({
  sessionId: z.string().min(1),
  prompt: z.string(),
  rootPaths: z.array(z.string().min(1)).default([]),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  mode: z.enum(['plan', 'build']).optional(),
  editMessageId: z.string().min(1).optional(),
  regenerateMessageId: z.string().min(1).optional(),
  maxSteps: z.number().int().positive().max(50).optional(),
  imagePaths: z.array(z.string().min(1)).max(4).optional(),
  references: z.array(messageFileReferenceSchema).max(64).optional()
});

export const agentStartResultSchema = z.object({ runId: z.string().min(1) });

export const agentCancelResultSchema = z.object({
  runId: z.string().min(1),
  cancelled: z.boolean()
});

export const agentRunResultSchema = z.object({
  runId: z.string().min(1),
  sessionId: z.string().min(1),
  steps: z.number().int().nonnegative(),
  toolCalls: z.number().int().nonnegative(),
  finishReason: z.string(),
  messages: z.array(
    z.object({
      role: z.enum(['system', 'user', 'assistant', 'tool']),
      content: z.string()
    })
  )
});

export type ProviderSettings = z.infer<typeof providerSettingsSchema>;
export type ProviderPublic = z.infer<typeof providerPublicSchema>;
export type ProviderRemoveResult = z.infer<typeof providerRemoveResultSchema>;
export type AgentProviderConfig = z.infer<typeof agentProviderConfigSchema>;
export type AgentRunInput = z.infer<typeof agentRunInputSchema>;
export type AgentStartResult = z.infer<typeof agentStartResultSchema>;
export type AgentCancelResult = z.infer<typeof agentCancelResultSchema>;
export type AgentRunResult = z.infer<typeof agentRunResultSchema>;

/**
 * 会话状态与 Agent 模式。
 */
export const sessionStatusSchema = z.enum([
  'idle',
  'running',
  'waiting_approval',
  'waiting_user',
  'completed',
  'failed',
  'interrupted',
  'archived'
]);

export const agentModeSchema = z.enum(['plan', 'build']);

/**
 * 会话导出格式与结果。
 */
export const sessionExportFormatSchema = z.enum(['markdown', 'html', 'pdf']);
export const sessionExportInputSchema = z.object({
  sessionId: z.string().min(1),
  format: sessionExportFormatSchema
});
export const sessionExportResultSchema = z.object({
  saved: z.boolean(),
  path: z.string().optional(),
  fileId: z.string().optional()
});
export type SessionExportFormat = z.infer<typeof sessionExportFormatSchema>;
export type SessionExportInput = z.infer<typeof sessionExportInputSchema>;
export type SessionExportResult = z.infer<typeof sessionExportResultSchema>;

export const sessionSummarySchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().optional(),
  title: z.string(),
  titleSource: z.enum(['auto', 'user']),
  pinned: z.boolean(),
  status: sessionStatusSchema,
  mode: agentModeSchema,
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  lastActiveAt: z.number()
});

export const sessionCreateInputSchema = z.object({
  title: z.string().optional(),
  workspaceId: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  mode: agentModeSchema.optional()
});

export const sessionRenameInputSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1)
});

export const sessionRemoveResultSchema = z.object({ id: z.string().min(1) });

export const sessionClearAllResultSchema = z.object({
  removed: z.number().int().nonnegative()
});

export const sessionSearchResultSchema = z.object({
  sessionId: z.string().min(1),
  sessionTitle: z.string(),
  messageId: z.string().min(1),
  role: z.enum(['user', 'assistant']),
  snippet: z.string(),
  matchStart: z.number().int().min(-1),
  matchEnd: z.number().int().min(-1),
  matchedAt: z.number().nonnegative()
});

export const sessionSetPinnedInputSchema = z.object({
  id: z.string().min(1),
  pinned: z.boolean()
});

export const sessionSetModelInputSchema = z.object({
  id: z.string().min(1),
  providerId: z.string().min(1),
  modelId: z.string().min(1)
});

export const sessionSetModeInputSchema = z.object({
  id: z.string().min(1),
  mode: agentModeSchema
});

export const sessionRootSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  path: z.string().min(1),
  kind: z.enum(['file', 'directory']),
  access: z.enum(['read', 'write']),
  source: z.enum(['session', 'workspace']),
  createdAt: z.number().nonnegative()
});

export const sessionAddRootsInputSchema = z.object({
  sessionId: z.string().min(1),
  paths: z.array(z.string().min(1)).min(1).max(1)
});

export const sessionRemoveRootInputSchema = z.object({
  sessionId: z.string().min(1),
  rootId: z.string().min(1)
});

export type SessionStatus = z.infer<typeof sessionStatusSchema>;
export type AgentMode = z.infer<typeof agentModeSchema>;
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
export type SessionCreateInput = z.infer<typeof sessionCreateInputSchema>;
export type SessionRenameInput = z.infer<typeof sessionRenameInputSchema>;
export type SessionRemoveResult = z.infer<typeof sessionRemoveResultSchema>;
export type SessionClearAllResult = z.infer<typeof sessionClearAllResultSchema>;
export type SessionSearchResult = z.infer<typeof sessionSearchResultSchema>;
export type SessionSetPinnedInput = z.infer<typeof sessionSetPinnedInputSchema>;
export type SessionSetModelInput = z.infer<typeof sessionSetModelInputSchema>;
export type SessionSetModeInput = z.infer<typeof sessionSetModeInputSchema>;
export type SessionRoot = z.infer<typeof sessionRootSchema>;
export type SessionAddRootsInput = z.infer<typeof sessionAddRootsInputSchema>;
export type SessionRemoveRootInput = z.infer<typeof sessionRemoveRootInputSchema>;

/**
 * 用户通过系统对话框选择的临时 root 集合。
 */
export const workspaceRootSelectionSchema = z.object({
  paths: z.array(z.string().min(1))
});

export const workspaceChooseRootInputSchema = z
  .object({
    defaultPath: z.string().min(1).optional()
  })
  .optional();

export type WorkspaceChooseRootInput = z.infer<typeof workspaceChooseRootInputSchema>;

export type WorkspaceRootSelection = z.infer<typeof workspaceRootSelectionSchema>;

export const workspaceFileReferenceSchema = z.object({
  path: z.string().min(1),
  root: z.string().min(1),
  relativePath: z.string().min(1),
  name: z.string().min(1),
  isImage: z.boolean()
});

export const workspaceAuthorizationRequestSchema = z.object({
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
  suggestedPath: z.string().min(1),
  toolName: z.string().optional(),
  toolCallId: z.string().optional()
});

export const workspaceAuthorizationResolveInputSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(['approved', 'rejected'])
});

export const workspaceAuthorizationSettledSchema = z.object({
  requestId: z.string().min(1)
});

export type WorkspaceAuthorizationRequest = z.infer<typeof workspaceAuthorizationRequestSchema>;
export type WorkspaceAuthorizationResolveInput = z.infer<
  typeof workspaceAuthorizationResolveInputSchema
>;
export type WorkspaceAuthorizationSettled = z.infer<typeof workspaceAuthorizationSettledSchema>;

export const workspaceFileSearchInputSchema = z.object({
  sessionId: z.string().min(1),
  query: z.string().max(200).default(''),
  limit: z.number().int().min(1).max(50).optional()
});

export type WorkspaceFileReference = z.infer<typeof workspaceFileReferenceSchema>;
export type WorkspaceFileSearchInput = z.infer<typeof workspaceFileSearchInputSchema>;

export const outputFileSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  runId: z.string().optional(),
  name: z.string().min(1),
  mime: z.string().min(1),
  bytes: z.number().nonnegative(),
  source: z.enum(['generated', 'downloaded']),
  createdAt: z.number().nonnegative()
});

export const fileSaveAsInputSchema = z.object({
  sessionId: z.string().min(1),
  fileId: z.string().min(1)
});

export const fileSaveAsResultSchema = z.object({
  fileId: z.string().min(1),
  saved: z.boolean(),
  path: z.string().optional()
});

export const fileReadInputSchema = z.object({
  sessionId: z.string().min(1),
  fileId: z.string().min(1)
});

export const fileReadResultSchema = z.object({
  fileId: z.string().min(1),
  name: z.string().min(1),
  mime: z.string().min(1),
  bytes: z.number().nonnegative(),
  base64: z.string()
});

export type OutputFile = z.infer<typeof outputFileSchema>;
export type FileReadInput = z.infer<typeof fileReadInputSchema>;
export type FileReadResult = z.infer<typeof fileReadResultSchema>;
export type FileSaveAsInput = z.infer<typeof fileSaveAsInputSchema>;
export type FileSaveAsResult = z.infer<typeof fileSaveAsResultSchema>;

/**
 * 可清理的缓存类别。
 */
export const languageSchema = z.enum(['zh-CN', 'en-US']);

export type AppLanguage = z.infer<typeof languageSchema>;

export const notificationBadgeStyleSchema = z.enum(['dot', 'count']);
export type NotificationBadgeStyle = z.infer<typeof notificationBadgeStyleSchema>;

export const cacheTargetSchema = z.enum(['files', 'artifacts', 'logs', 'all']);

/**
 * 缓存占用统计。
 */
export const cacheInfoSchema = z.object({
  filesBytes: z.number().nonnegative(),
  artifactsBytes: z.number().nonnegative(),
  logsBytes: z.number().nonnegative(),
  totalBytes: z.number().nonnegative(),
  failed: z.array(cacheTargetSchema)
});

export type CacheTarget = z.infer<typeof cacheTargetSchema>;
export type CacheInfo = z.infer<typeof cacheInfoSchema>;

/**
 * 读取长输出产物；路径只由主进程解析。
 */
export const artifactReadInputSchema = z.object({
  sessionId: z.string().min(1),
  artifactId: z.string().min(1)
});

export const artifactReadResultSchema = z.object({
  artifactId: z.string().min(1),
  label: z.string(),
  bytes: z.number().nonnegative(),
  content: z.string()
});

export type ArtifactReadInput = z.infer<typeof artifactReadInputSchema>;
export type ArtifactReadResult = z.infer<typeof artifactReadResultSchema>;

/**
 * 用户对审批请求的决定。
 */
export const approvalResolveInputSchema = z.object({
  approvalId: z.string().min(1),
  approved: z.boolean()
});

export const approvalResolveResultSchema = z.object({
  approvalId: z.string().min(1),
  resolved: z.boolean()
});

export type ApprovalResolveInput = z.infer<typeof approvalResolveInputSchema>;
export type ApprovalResolveResult = z.infer<typeof approvalResolveResultSchema>;

/**
 * 恢复检查点。
 */
export const checkpointRestoreInputSchema = z.object({
  sessionId: z.string().min(1),
  checkpointId: z.string().min(1)
});

export const checkpointDiffInputSchema = checkpointRestoreInputSchema;
export const checkpointOpenInputSchema = checkpointRestoreInputSchema;
export const checkpointOpenResultSchema = z.object({ opened: z.boolean() });

export const checkpointDiffResultSchema = z.object({
  checkpointId: z.string().min(1),
  path: z.string().min(1),
  existed: z.boolean(),
  oldText: z.string(),
  newText: z.string(),
  truncated: z.boolean(),
  binary: z.boolean()
});

export const checkpointRestoreResultSchema = z.object({
  checkpointId: z.string().min(1),
  restored: z.number().int().nonnegative()
});

export type CheckpointRestoreInput = z.infer<typeof checkpointRestoreInputSchema>;
export type CheckpointDiffInput = z.infer<typeof checkpointDiffInputSchema>;
export type CheckpointOpenInput = z.infer<typeof checkpointOpenInputSchema>;
export type CheckpointOpenResult = z.infer<typeof checkpointOpenResultSchema>;
export type CheckpointDiffResult = z.infer<typeof checkpointDiffResultSchema>;
export type CheckpointRestoreResult = z.infer<typeof checkpointRestoreResultSchema>;
