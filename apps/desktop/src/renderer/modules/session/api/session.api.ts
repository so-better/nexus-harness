/**
 * 会话 API：组件与 store 不直接访问 window.nexus。
 */

import type { NexusEvent } from '@shared/events';
import type { SessionCreateInput, SessionRenameInput, SessionSummary } from '@shared/ipc/contracts';
import { unwrap } from '@/app/ipc';

/**
 * 读取会话列表。
 */
export const listSessions = async (): Promise<SessionSummary[]> =>
  unwrap(await window.nexus.session.list());

/**
 * 创建会话。
 */
export const createSession = async (input: SessionCreateInput = {}): Promise<SessionSummary> =>
  unwrap(await window.nexus.session.create(input));

/**
 * 读取会话事件流。
 */
export const getSessionEvents = async (id: string): Promise<NexusEvent[]> =>
  unwrap(await window.nexus.session.events(id));

/**
 * 重命名会话。
 */
export const renameSession = async (input: SessionRenameInput): Promise<SessionSummary> =>
  unwrap(await window.nexus.session.rename(input));

/**
 * 设置置顶。
 */
export const setSessionPinned = async (id: string, pinned: boolean): Promise<SessionSummary> =>
  unwrap(await window.nexus.session.setPinned({ id, pinned }));

/**
 * 更新会话当前服务商与模型。
 */
export const setSessionModel = async (
  id: string,
  providerId: string,
  modelId: string
): Promise<SessionSummary> =>
  unwrap(await window.nexus.session.setModel({ id, providerId, modelId }));

/**
 * 删除会话。
 */
export const removeSession = async (id: string): Promise<void> => {
  unwrap(await window.nexus.session.remove(id));
};
