/**
 * 会话 API：组件与 store 不直接访问 nexus。
 */

import { nexus } from '@/app/nexus-bridge';
import type {
  AgentMode,
  ApprovalPolicy,
  SessionCreateInput,
  SessionExportResult,
  SessionRenameInput,
  SessionRoot,
  SessionSearchResult,
  SessionSummary
} from '@shared/ipc/contracts';
import { unwrap } from '@/app/ipc';

/**
 * 读取会话列表。
 */
export const listSessions = async (): Promise<SessionSummary[]> =>
  unwrap(await nexus.session.list());

/**
 * 创建会话。
 */
export const createSession = async (input: SessionCreateInput = {}): Promise<SessionSummary> =>
  unwrap(await nexus.session.create(input));

/**
 * 重命名会话。
 */
export const renameSession = async (input: SessionRenameInput): Promise<SessionSummary> =>
  unwrap(await nexus.session.rename(input));

/**
 * 设置置顶。
 */
export const setSessionPinned = async (id: string, pinned: boolean): Promise<SessionSummary> =>
  unwrap(await nexus.session.setPinned({ id, pinned }));

/**
 * 更新会话当前服务商与模型。
 */
export const setSessionModel = async (
  id: string,
  providerId: string,
  modelId: string
): Promise<SessionSummary> => unwrap(await nexus.session.setModel({ id, providerId, modelId }));

/**
 * 设置会话 Agent 模式。
 */
export const setSessionMode = async (id: string, mode: AgentMode): Promise<SessionSummary> =>
  unwrap(await nexus.session.setMode({ id, mode }));

export const setSessionApprovalPolicy = async (
  id: string,
  approvalPolicy: ApprovalPolicy
): Promise<SessionSummary> => unwrap(await nexus.session.setApprovalPolicy({ id, approvalPolicy }));

/**
 * 读取会话已授权的工作区 root。
 */
export const chooseRoot = async (defaultPath?: string): Promise<string[]> =>
  unwrap(await nexus.workspace.chooseRoot(defaultPath ? { defaultPath } : undefined)).paths;

export const getSessionRoots = async (id: string): Promise<SessionRoot[]> =>
  unwrap(await nexus.session.roots(id));

/**
 * 授权一组工作区路径。
 */
export const addSessionRoots = async (id: string, paths: string[]): Promise<SessionRoot[]> =>
  unwrap(await nexus.session.addRoots({ sessionId: id, paths }));

/**
 * 撤销一个工作区 root。
 */
export const removeSessionRoot = async (id: string, rootId: string): Promise<SessionRoot[]> =>
  unwrap(await nexus.session.removeRoot({ sessionId: id, rootId }));

/**
 * 删除会话。
 */
export const removeSession = async (id: string): Promise<void> => {
  unwrap(await nexus.session.remove(id));
};

/**
 * 清除全部会话，返回删除数量。
 */
export const clearAllSessions = async (): Promise<number> =>
  unwrap(await nexus.session.clearAll()).removed;

/**
 * 跨会话搜索标题与消息内容。
 */
export const searchSessions = async (query: string): Promise<SessionSearchResult[]> =>
  unwrap(await nexus.session.search(query));

/**
 * 订阅会话标题等投影变更。
 */
export const subscribeSessionChanges = (handler: (session: SessionSummary) => void): (() => void) =>
  nexus.session.onChanged(handler);

export const onSessionActivate = (handler: (sessionId: string) => void): (() => void) =>
  nexus.session.onActivate(handler);

/**
 * 导出会话为指定格式。
 */
export const exportSession = async (
  sessionId: string,
  format: 'markdown' | 'html' | 'pdf'
): Promise<SessionExportResult> => unwrap(await nexus.session.export({ sessionId, format }));

/**
 * 读取通知点击后待激活的会话。
 */
export const consumePendingSession = async (): Promise<string | null> =>
  unwrap(await nexus.app.consumePendingSession());

/**
 * 订阅会话 root 变化；主进程在工具授权目录后推送。
 */
export const onSessionRootsChanged = (handler: (sessionId: string) => void): (() => void) =>
  nexus.session.onRootsChanged(handler);
