/**
 * 聊天 store：缓存会话事件、运行状态、审批与临时工作目录。
 */

import { reactive, ref } from 'vue';
import { defineStore } from 'pinia';
import { t } from '@/app/i18n';
import { appendAgentEvent } from '../event-cache';
import type { NexusEvent } from '@shared/events';
import {
  cancelAgent,
  chooseRoot,
  loadEvents,
  resolveApproval,
  runAgent,
  subscribeAgentEvents
} from '../api/chat.api';
import { useProviderSelection } from '../provider-selection';

/**
 * 每个会话独立缓存事件，切换会话时不丢后台事件。
 */
export const useChatStore = defineStore('chat', () => {
  const rootPaths = ref<string[]>([]);
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
  const send = async (sessionId: string, prompt: string): Promise<void> => {
    if (!providerId.value) {
      error.value = t('chat.needsProvider');
      return;
    }
    if (!modelId.value) {
      error.value = t('chat.needsModel');
      return;
    }
    error.value = undefined;
    runningBySession[sessionId] = true;
    try {
      const result = await runAgent({
        sessionId,
        prompt,
        rootPaths: rootPaths.value,
        providerId: providerId.value,
        modelId: modelId.value
      });
      runIds[sessionId] = result.runId;
    } catch (reason) {
      runningBySession[sessionId] = false;
      error.value = reason instanceof Error ? reason.message : String(reason);
    }
  };

  /**
   * 停止当前会话的 Run。
   */
  const stop = async (sessionId: string): Promise<void> => {
    const runId = runIds[sessionId];
    if (!runId) return;
    try {
      await cancelAgent(runId);
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
   * 选择临时工作目录；多选后去重追加。
   */
  const addRoot = async (): Promise<void> => {
    try {
      const paths = await chooseRoot();
      rootPaths.value = [...new Set([...rootPaths.value, ...paths])];
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
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
    rootPaths,
    error,
    eventsBySession,
    runningBySession,
    initialize,
    refreshProviders,
    dispose,
    loadHistory,
    send,
    stop,
    decideApproval,
    addRoot,
    setProvider,
    setModel,
    clearError
  };
});
