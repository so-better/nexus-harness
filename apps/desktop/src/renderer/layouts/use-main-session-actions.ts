/**
 * 主布局会话动作：新建、选择、删除、重命名、导出与消息定位。
 */
import { ref } from 'vue';
import { useMessage } from 'naive-ui';
import { storeToRefs } from 'pinia';
import { t } from '@/app/i18n';
import { useChatStore } from '@/modules/chat/stores/chat.store';
import { exportSession as exportSessionApi } from '@/modules/session/api/session.api';
import { useSessionStore } from '@/modules/session/stores/session.store';

export const useMainSessionActions = () => {
  const sessions = useSessionStore();
  const chat = useChatStore();
  const message = useMessage();
  const { activeId } = storeToRefs(sessions);
  const { providerId, modelId } = storeToRefs(chat);
  const exporting = ref(false);
  const focusMessage = ref<{ id: string; token: number; sessionId: string }>();
  let focusSequence = 0;

  /**
   * 新建会话并使用当前 Provider。
   */
  const createSession = async (): Promise<void> => {
    const created = await sessions.create(providerId.value, modelId.value);
    if (!created) message.error(sessions.error ?? t('session.createFailed'));
  };

  const selectSession = (id: string): void => {
    sessions.select(id);
  };

  /**
   * 从跨会话搜索结果打开并定位消息。
   */
  const openSearchMessage = (sessionId: string, messageId: string): void => {
    sessions.select(sessionId);
    focusSequence += 1;
    focusMessage.value = { id: messageId, token: focusSequence, sessionId };
  };

  /**
   * 没有会话时自动创建一个，保证始终有可进入的工作上下文。
   */
  const ensureSession = async (): Promise<string | undefined> => {
    if (sessions.activeId) return sessions.activeId;
    if (sessions.sessions.length === 0) {
      const created = await sessions.create(providerId.value, modelId.value);
      return created?.id;
    }
    return sessions.activeId ?? undefined;
  };

  /**
   * 删除会话；删掉最后一个后自动补一个新会话。
   */
  const removeSession = async (id: string): Promise<void> => {
    const removed = await sessions.remove(id);
    if (!removed) {
      message.error(sessions.error ?? t('session.removeFailed'));
      return;
    }
    await ensureSession();
  };

  const exportSession = async (id: string, format: 'markdown' | 'html' | 'pdf'): Promise<void> => {
    try {
      const result = await exportSessionApi(id, format);
      if (result.saved) message.success(t('session.exported'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('session.exportFailed'));
    }
  };

  const exportActiveSession = async (format: 'markdown' | 'html' | 'pdf'): Promise<void> => {
    if (!activeId.value || exporting.value) return;
    exporting.value = true;
    try {
      await exportSession(activeId.value, format);
    } finally {
      exporting.value = false;
    }
  };

  const renameSession = async (id: string, title: string): Promise<void> => {
    const renamed = await sessions.rename(id, title);
    if (!renamed) message.error(sessions.error ?? t('session.renameFailed'));
  };

  /**
   * 清除全部会话；完成后自动进入一个新会话。
   */
  const clearAllSessions = async (): Promise<void> => {
    const cleared = await sessions.clearAll();
    if (!cleared) {
      message.error(sessions.error ?? t('session.clearAllFailed'));
      return;
    }
    await ensureSession();
  };

  return {
    exporting,
    focusMessage,
    createSession,
    selectSession,
    openSearchMessage,
    ensureSession,
    removeSession,
    exportActiveSession,
    renameSession,
    clearAllSessions
  };
};
