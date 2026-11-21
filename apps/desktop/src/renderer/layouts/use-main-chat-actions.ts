/**
 * 主布局聊天动作：发送、回答、编辑、重生成、模型与模式切换。
 */
import type { Ref } from 'vue';
import { useMessage } from 'naive-ui';
import { storeToRefs } from 'pinia';
import type { AskUserAnswer } from '@shared/ask-user';
import type { AgentMode } from '@shared/ipc/contracts';
import type { MessageFileReference } from '@shared/events';
import { t } from '@/app/i18n';
import { useChatStore } from '@/modules/chat/stores/chat.store';
import type { ChatProjection } from '@/modules/chat/types';
import { useSessionStore } from '@/modules/session/stores/session.store';

interface ChatActionDeps {
  activeRunning: Ref<boolean>;
  projection: Ref<ChatProjection>;
}

export const useMainChatActions = (deps: ChatActionDeps) => {
  const sessions = useSessionStore();
  const chat = useChatStore();
  const message = useMessage();
  const { activeId } = storeToRefs(sessions);
  const { providerId, modelId } = storeToRefs(chat);

  /**
   * 发送消息；没有会话时先创建。
   */
  const send = async (
    prompt: string,
    imagePaths?: string[],
    references?: MessageFileReference[],
    attachmentIds?: string[]
  ): Promise<void> => {
    if (!activeId.value) {
      const created = await sessions.create(providerId.value, modelId.value);
      if (!created) {
        message.error(sessions.error ?? t('session.createFailed'));
        return;
      }
    }
    if (activeId.value) {
      const started = await chat.send(
        activeId.value,
        prompt,
        imagePaths,
        references,
        attachmentIds
      );
      if (!started) message.error(chat.error ?? t('chat.sendFailed'));
    }
  };

  /**
   * 持久化当前会话的服务商与模型选择。
   */
  const persistSelection = (): void => {
    if (activeId.value && providerId.value && modelId.value) {
      sessions
        .updateModel(activeId.value, providerId.value, modelId.value)
        .catch((error: unknown) => console.error('保存会话模型失败', error));
    }
  };

  const updateProvider = (id: string): void => {
    chat.setProvider(id);
    persistSelection();
  };

  const updateModel = (id: string): void => {
    chat.setModel(id);
    persistSelection();
  };

  const answerUser = async (
    requestId: string,
    answers: AskUserAnswer[] | undefined
  ): Promise<void> => {
    const answered = await chat.answerAskUser(requestId, answers);
    if (!answered) message.error(chat.error ?? t('chat.askUserFailed'));
  };

  const editMessage = async (
    messageId: string,
    content: string,
    references?: MessageFileReference[],
    attachmentIds?: string[]
  ): Promise<void> => {
    if (!activeId.value || deps.activeRunning.value) return;
    const started = await chat.editMessage(
      activeId.value,
      messageId,
      content,
      references,
      attachmentIds
    );
    if (!started) message.error(chat.error ?? t('chat.editFailed'));
  };

  const regenerateMessage = async (messageId: string): Promise<void> => {
    if (!activeId.value || deps.activeRunning.value) return;
    const lastUser = [...deps.projection.value.messages]
      .reverse()
      .find((item) => item.role === 'user');
    if (!lastUser) return;
    const started = await chat.regenerateMessage(activeId.value, messageId, lastUser.content);
    if (!started) message.error(chat.error ?? t('chat.regenerateFailed'));
  };

  const changeMode = async (mode: AgentMode): Promise<void> => {
    if (!activeId.value || deps.activeRunning.value) return;
    const updated = await sessions.updateMode(activeId.value, mode);
    if (!updated) message.error(sessions.error ?? t('chat.modeChangeFailed'));
  };

  const stop = async (): Promise<void> => {
    if (activeId.value) await chat.stop(activeId.value);
  };

  return {
    send,
    updateProvider,
    updateModel,
    answerUser,
    editMessage,
    regenerateMessage,
    changeMode,
    stop
  };
};
