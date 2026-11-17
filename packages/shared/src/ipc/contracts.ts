/* 跨进程契约：应用级 IPC 的 zod schema 与 preload 桥接类型。 */

import { z } from 'zod';
import type { NexusEvent } from '../events';
import type { Result } from './result';

/* 应用基础信息，用于确认渲染进程与主进程通道可用。 */
export const appInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  platform: z.string()
});

export type AppInfo = z.infer<typeof appInfoSchema>;

/* 主题来源：跟随系统、强制浅色或强制深色。 */
export const themeSourceSchema = z.enum(['system', 'light', 'dark']);

/* 主题状态：source 为用户选择，effective 为当前实际生效主题。 */
export const themeInfoSchema = z.object({
  source: themeSourceSchema,
  effective: z.enum(['light', 'dark'])
});

export type ThemeSource = z.infer<typeof themeSourceSchema>;
export type ThemeInfo = z.infer<typeof themeInfoSchema>;

/* Provider 保存参数；apiKey 省略时保留旧密钥。 */
export const providerSettingsSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  baseUrl: z.string().min(1),
  model: z.string().min(1),
  apiKey: z.string().min(1).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  extraParams: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional()
});

/* 对外展示的 Provider 配置，不包含 API Key。 */
export const providerPublicSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  baseUrl: z.string().min(1),
  model: z.string().min(1),
  enabled: z.boolean()
});

/* 主进程内部使用的完整 Provider 配置；headers/extraParams 视为敏感字段。 */
export const agentProviderConfigSchema = providerPublicSchema.extend({
  apiKey: z.string().min(1),
  headers: z.record(z.string(), z.string()).optional(),
  extraParams: z.record(z.string(), z.unknown()).optional()
});

export const providerRemoveResultSchema = z.object({ id: z.string().min(1) });

/* 取消订阅函数，preload 与插件 API 共用。 */
export type Unsubscribe = () => void;

/* preload 暴露到 window.nexus 的桥接接口。 */
export interface NexusBridge {
  app: {
    getInfo: () => Promise<Result<AppInfo>>;
  };
  theme: {
    getInfo: () => Promise<Result<ThemeInfo>>;
    setSource: (source: ThemeSource) => Promise<Result<ThemeInfo>>;
    onChange: (handler: (info: ThemeInfo) => void) => Unsubscribe;
  };
  provider: {
    list: () => Promise<Result<ProviderPublic[]>>;
    save: (input: ProviderSettings) => Promise<Result<ProviderPublic>>;
    remove: (id: string) => Promise<Result<ProviderRemoveResult>>;
  };
  session: {
    list: () => Promise<Result<SessionSummary[]>>;
    create: (input: SessionCreateInput) => Promise<Result<SessionSummary>>;
    get: (id: string) => Promise<Result<SessionSummary>>;
    rename: (input: SessionRenameInput) => Promise<Result<SessionSummary>>;
    setPinned: (input: SessionSetPinnedInput) => Promise<Result<SessionSummary>>;
    remove: (id: string) => Promise<Result<SessionRemoveResult>>;
  };
  checkpoint: {
    restore: (input: CheckpointRestoreInput) => Promise<Result<CheckpointRestoreResult>>;
  };
  approval: {
    resolve: (input: ApprovalResolveInput) => Promise<Result<ApprovalResolveResult>>;
  };
  agent: {
    run: (input: AgentRunInput) => Promise<Result<AgentStartResult>>;
    cancel: (runId: string) => Promise<Result<AgentCancelResult>>;
    onEvent: (handler: (event: NexusEvent) => void) => Unsubscribe;
  };
}

/* Agent 运行只引用已保存的 Provider，避免渲染进程直接传 API Key。 */
export const agentRunInputSchema = z.object({
  sessionId: z.string().min(1),
  prompt: z.string().min(1),
  rootPaths: z.array(z.string().min(1)).min(1),
  providerId: z.string().min(1),
  maxSteps: z.number().int().positive().max(50).optional()
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

/* 会话状态与 Agent 模式。 */
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

export const sessionSummarySchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().optional(),
  title: z.string(),
  titleSource: z.enum(['auto', 'user']),
  pinned: z.boolean(),
  status: sessionStatusSchema,
  mode: agentModeSchema,
  providerId: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  lastActiveAt: z.number()
});

export const sessionCreateInputSchema = z.object({
  title: z.string().optional(),
  workspaceId: z.string().optional(),
  providerId: z.string().optional(),
  mode: agentModeSchema.optional()
});

export const sessionRenameInputSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1)
});

export const sessionRemoveResultSchema = z.object({ id: z.string().min(1) });

export const sessionSetPinnedInputSchema = z.object({
  id: z.string().min(1),
  pinned: z.boolean()
});

export type SessionStatus = z.infer<typeof sessionStatusSchema>;
export type AgentMode = z.infer<typeof agentModeSchema>;
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
export type SessionCreateInput = z.infer<typeof sessionCreateInputSchema>;
export type SessionRenameInput = z.infer<typeof sessionRenameInputSchema>;
export type SessionRemoveResult = z.infer<typeof sessionRemoveResultSchema>;
export type SessionSetPinnedInput = z.infer<typeof sessionSetPinnedInputSchema>;

/* 用户对审批请求的决定。 */
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

/* 恢复检查点。 */
export const checkpointRestoreInputSchema = z.object({
  sessionId: z.string().min(1),
  checkpointId: z.string().min(1)
});

export const checkpointRestoreResultSchema = z.object({
  checkpointId: z.string().min(1),
  restored: z.number().int().nonnegative()
});

export type CheckpointRestoreInput = z.infer<typeof checkpointRestoreInputSchema>;
export type CheckpointRestoreResult = z.infer<typeof checkpointRestoreResultSchema>;
