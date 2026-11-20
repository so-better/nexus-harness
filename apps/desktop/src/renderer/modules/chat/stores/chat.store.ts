/**
 * 聊天 store：缓存会话事件、运行状态、审批与临时工作目录。
 */

import { computed, reactive, ref } from 'vue';
import { defineStore } from 'pinia';
import { t } from '@/app/i18n';
import { appendAgentEvent } from '../event-cache';
import type { MessageFileReference, NexusEvent } from '@shared/events';
import type { SessionRoot } from '@shared/ipc/contracts';
import type { AskUserAnswer } from '@shared/ask-user';
import {
  answerAskUser as answerAskUserApi,
  cancelAgent,
  cancelAgentSession,
  chooseRoot,
  loadEvents,
  resolveApproval,
  runAgent,
  subscribeAgentEvents
} from '../api/chat.api';
import { useProviderSelection } from '../provider-selection';
import {
  addSessionRoots,
  getSessionRoots,
  removeSessionRoot
} from '@/modules/session/api/session.api';

/**
 * 每个会话独立缓存事件，切换会话时不丢后台事件。
 */
export const useChatStore = defineStore('chat', () => {
  const roots = ref<SessionRoot[]>([]);
  const rootPaths = computed(() => roots.value.map((root) => root.path));
  const error = ref<string | undefined>();

  const providerSelection = useProviderSelection((message) => {
    error.value = message;
  });
  const { providers, providerId, modelId, models, refreshProviders, setProvider, setModel } =
    providerSelection;

  const eventsBySession = reactive<Record<string, NexusEvent[]>>({});
  const loadedSessions = reactive<Record<string, boolean>>({});
  const runningBySession = reactive<Record<string, boolean>>({});
  const runIds = reactive<Record<string, string>>({});

  let unsubscribe: (() => void) | undefined;
  let initialized = false;

  /**
   * 初始化 Provider 列表与事件订阅；重复调用安全。
   */
  const initialize = async (): Promise<void> => {
    if (initialized) return;
    initialized = true;
    await refreshProviders();
    unsubscribe = subscribeAgentEvents((event) =>
      appendAgentEvent(eventsBySession, runningBySession, runIds, event)
    );
  };

  /**
   * 释放事件订阅。
   */
  const dispose = (): void => {
    unsubscribe?.();
    unsubscribe = undefined;
    initialized = false;
  };

  /**
   * 读取会话历史；已加载的会话直接复用缓存。
   */
  const loadHistory = async (sessionId: string): Promise<void> => {
    if (loadedSessions[sessionId]) return;

    try {
      eventsBySession[sessionId] = await loadEvents(sessionId);
      loadedSessions[sessionId] = true;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
    }
  };

  /**
   * 发送消息；会话、模型与目录必须已确定。
   */
  const dispatchRun = async (
    sessionId: string,
    prompt: string,
    extra: {
      editMessageId?: string;
      regenerateMessageId?: string;
      imagePaths?: string[];
      references?: MessageFileReference[];
    } = {}
  ): Promise<boolean> => {
    if (!providerId.value) {
      error.value = t('chat.needsProvider');
      return false;
    }
    if (!modelId.value) {
      error.value = t('chat.needsModel');
      return false;
    }
    error.value = undefined;
    runningBySession[sessionId] = true;
    try {
      const result = await runAgent({
        sessionId,
        prompt,
        rootPaths: [...rootPaths.value],
        providerId: providerId.value,
        modelId: modelId.value,
        ...extra
      });
      runIds[sessionId] = result.runId;
      return true;
    } catch (reason) {
      runningBySession[sessionId] = false;
      error.value = reason instanceof Error ? reason.message : String(reason);
      return false;
    }
  };

  /**
   * 发送新消息。
   */
  const send = async (
    sessionId: string,
    prompt: string,
    imagePaths?: string[],
    references?: MessageFileReference[],
    attachmentIds?: string[]
  ): Promise<boolean> =>
    dispatchRun(sessionId, prompt, {
      ...(imagePaths ? { imagePaths } : {}),
      ...(references ? { references } : {}),
      ...(attachmentIds?.length ? { attachmentIds } : {})
    });

  /**
   * 编辑用户消息并重新发送。
   */
  const editMessage = async (
    sessionId: string,
    messageId: string,
    prompt: string,
    references?: MessageFileReference[],
    attachmentIds?: string[]
  ): Promise<boolean> =>
    dispatchRun(sessionId, prompt, {
      editMessageId: messageId,
      ...(references ? { references } : {}),
      ...(attachmentIds?.length ? { attachmentIds } : {})
    });

  /**
   * 基于当前上下文重新生成指定助手回复。
   */
  const regenerateMessage = async (
    sessionId: string,
    messageId: string,
    prompt: string
  ): Promise<boolean> => dispatchRun(sessionId, prompt, { regenerateMessageId: messageId });

  /**
   * 停止当前会话的 Run。
   */
  const stop = async (sessionId: string): Promise<void> => {
    try {
      const runId = runIds[sessionId];
      if (!runId) {
        await cancelAgentSession(sessionId);
        return;
      }
      const result = await cancelAgent(runId);
      if (!result.cancelled) await cancelAgentSession(sessionId);
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
    }
  };

  /**
   * 提交审批决定。
   */
  const decideApproval = async (approvalId: string, approved: boolean): Promise<void> => {
    try {
      await resolveApproval(approvalId, approved);
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
    }
  };

  /**
   * 读取会话已持久化的 root；切换会话时刷新。
   */
  const loadRoots = async (sessionId: string): Promise<void> => {
    try {
      roots.value = await getSessionRoots(sessionId);
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
    }
  };

  /**
   * 选择并授权工作区目录，授权写入会话。
   */
  const addRoot = async (sessionId: string): Promise<'added' | 'cancelled' | 'failed'> => {
    try {
      const paths = await chooseRoot(roots.value[0]?.path);
      if (paths.length === 0) return 'cancelled';
      roots.value = await addSessionRoots(sessionId, [paths[0]!]);
      return 'added';
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
      return 'failed';
    }
  };

  /**
   * 撤销会话 root。
   */
  const removeRoot = async (sessionId: string, rootId: string): Promise<boolean> => {
    try {
      roots.value = await removeSessionRoot(sessionId, rootId);
      return true;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
      return false;
    }
  };

  /**
   * 回答 Agent 提问；取消时传 undefined。
   */
  const answerAskUser = async (
    requestId: string,
    answers: AskUserAnswer[] | undefined
  ): Promise<boolean> => {
    error.value = undefined;
    try {
      const result = await answerAskUserApi({
        requestId,
        answers: answers ?? [],
        cancelled: answers === undefined
      });
      if (!result.resolved) {
        error.value = t('chat.askUserNotPending');
        return false;
      }
      return true;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
      return false;
    }
  };

  /**
   * 清空错误提示。
   */
  const clearError = (): void => {
    error.value = undefined;
  };

  return {
    providers,
    providerId,
    modelId,
    models,
    roots,
    rootPaths,
    error,
    eventsBySession,
    runningBySession,
    initialize,
    refreshProviders,
    dispose,
    loadHistory,
    send,
    editMessage,
    regenerateMessage,
    stop,
    decideApproval,
    answerAskUser,
    loadRoots,
    addRoot,
    removeRoot,
    setProvider,
    setModel,
    clearError
  };
});
