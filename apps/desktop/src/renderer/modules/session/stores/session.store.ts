/**
 * 会话 store：维护会话列表与当前选中会话。
 */

import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type {
  AgentMode,
  ApprovalPolicy,
  SessionStatus,
  SessionSummary
} from '@shared/ipc/contracts';
import {
  clearAllSessions,
  createSession,
  listSessions,
  removeSession,
  renameSession,
  setSessionMode,
  setSessionApprovalPolicy,
  setSessionModel,
  setSessionPinned
} from '../api/session.api';

/**
 * 会话列表面板与当前上下文。
 */
export const useSessionStore = defineStore('sessions', () => {
  const sessions = ref<SessionSummary[]>([]);
  const activeId = ref<string | undefined>();
  const loading = ref(false);
  const error = ref<string | undefined>();

  const activeSession = computed(() =>
    sessions.value.find((session) => session.id === activeId.value)
  );

  /**
   * 读取会话列表；优先保留当前选中的会话。
   */
  const load = async (): Promise<void> => {
    loading.value = true;
    error.value = undefined;
    try {
      sessions.value = await listSessions();
      if (!sessions.value.some((session) => session.id === activeId.value)) {
        activeId.value = sessions.value[0]?.id;
      }
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
    } finally {
      loading.value = false;
    }
  };

  /**
   * 新建会话并选中。
   */
  const create = async (
    providerId?: string,
    modelId?: string
  ): Promise<SessionSummary | undefined> => {
    error.value = undefined;
    try {
      const session = await createSession({
        ...(providerId ? { providerId } : {}),
        ...(modelId ? { modelId } : {})
      });
      sessions.value = [session, ...sessions.value];
      activeId.value = session.id;
      return session;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
      return undefined;
    }
  };

  /**
   * 选中会话。
   */
  const select = (id: string): void => {
    if (!sessions.value.some((session) => session.id === id)) return;
    activeId.value = id;
  };

  /**
   * 用户重命名会话并更新本地列表。
   */
  const rename = async (id: string, title: string): Promise<boolean> => {
    error.value = undefined;
    try {
      const updated = await renameSession({ id, title });
      sessions.value = sessions.value.map((session) => (session.id === id ? updated : session));
      return true;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
      return false;
    }
  };

  /**
   * 接收主进程推送的会话投影更新。
   */
  const applyUpdate = (updated: SessionSummary): void => {
    const index = sessions.value.findIndex((session) => session.id === updated.id);
    if (index < 0) {
      sessions.value = [updated, ...sessions.value];
      return;
    }
    sessions.value = sessions.value.map((session) =>
      session.id === updated.id ? updated : session
    );
  };

  /**
   * 设置会话模式。
   */
  const updateMode = async (id: string, mode: AgentMode): Promise<boolean> => {
    error.value = undefined;
    try {
      const updated = await setSessionMode(id, mode);
      sessions.value = sessions.value.map((session) => (session.id === id ? updated : session));
      return true;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
      return false;
    }
  };

  /**
   * 设置会话审批策略。
   */
  const updateApprovalPolicy = async (
    id: string,
    approvalPolicy: ApprovalPolicy
  ): Promise<boolean> => {
    error.value = undefined;
    try {
      const updated = await setSessionApprovalPolicy(id, approvalPolicy);
      sessions.value = sessions.value.map((session) => (session.id === id ? updated : session));
      return true;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
      return false;
    }
  };

  /**
   * 删除会话并选中下一个可用会话。
   */
  const remove = async (id: string): Promise<boolean> => {
    error.value = undefined;
    try {
      await removeSession(id);
      sessions.value = sessions.value.filter((session) => session.id !== id);
      if (activeId.value === id) activeId.value = sessions.value[0]?.id;
      return true;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
      return false;
    }
  };

  /**
   * 清除全部会话；成功后清空本地列表与当前选中项。
   */
  const clearAll = async (): Promise<boolean> => {
    error.value = undefined;
    try {
      await clearAllSessions();
      sessions.value = [];
      activeId.value = undefined;
      return true;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
      return false;
    }
  };

  /**
   * 切换置顶状态。
   */
  const togglePinned = async (id: string): Promise<void> => {
    const session = sessions.value.find((item) => item.id === id);
    if (!session) return;

    try {
      const updated = await setSessionPinned(id, !session.pinned);
      sessions.value = sessions.value
        .map((item) => (item.id === id ? updated : item))
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastActiveAt - a.lastActiveAt);
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
    }
  };

  /**
   * 更新会话当前服务商与模型。
   */
  const updateModel = async (id: string, providerId: string, modelId: string): Promise<void> => {
    try {
      const updated = await setSessionModel(id, providerId, modelId);
      sessions.value = sessions.value.map((session) => (session.id === id ? updated : session));
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
    }
  };

  /**
   * 用实时事件状态更新侧栏，避免等待下一次列表刷新。
   */
  const setLocalStatus = (id: string, status: SessionStatus): void => {
    sessions.value = sessions.value.map((session) =>
      session.id === id ? { ...session, status } : session
    );
  };

  return {
    sessions,
    activeId,
    loading,
    error,
    activeSession,
    load,
    create,
    updateModel,
    updateMode,
    updateApprovalPolicy,
    applyUpdate,
    rename,
    select,
    remove,
    clearAll,
    togglePinned,
    setLocalStatus
  };
});
