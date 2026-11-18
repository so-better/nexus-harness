/**
 * 会话 store：维护会话列表与当前选中会话。
 */

import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { SessionStatus, SessionSummary } from '@shared/ipc/contracts';
import { createSession, listSessions, removeSession, setSessionPinned } from '../api/session.api';

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
  const create = async (providerId?: string): Promise<SessionSummary | undefined> => {
    error.value = undefined;
    try {
      const session = await createSession(providerId ? { providerId } : {});
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
    activeId.value = id;
  };

  /**
   * 删除会话并选中下一个可用会话。
   */
  const remove = async (id: string): Promise<void> => {
    error.value = undefined;
    try {
      await removeSession(id);
      sessions.value = sessions.value.filter((session) => session.id !== id);
      if (activeId.value === id) activeId.value = sessions.value[0]?.id;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
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
    select,
    remove,
    togglePinned,
    setLocalStatus
  };
});
