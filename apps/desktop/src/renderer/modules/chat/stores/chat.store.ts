/**
 * 聊天 store：缓存会话事件、运行状态、审批与临时工作目录。
 */

import { reactive, ref } from 'vue';
import { defineStore } from 'pinia';
import { t } from '@/app/i18n';
import type { NexusEvent } from '@shared/events';
import type { ProviderPublic } from '@shared/ipc/contracts';
import {
  cancelAgent,
  chooseRoot,
  listProviders,
  loadEvents,
  resolveApproval,
  runAgent,
  subscribeAgentEvents
} from '../api/chat.api';

/**
 * 每个会话独立缓存事件，切换会话时不丢后台事件。
 */
export const useChatStore = defineStore('chat', () => {
  const providers = ref<ProviderPublic[]>([]);
  const providerId = ref<string | undefined>();
  const rootPaths = ref<string[]>([]);
  const error = ref<string | undefined>();

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

    try {
      providers.value = await listProviders();
      const enabled = providers.value.find((provider) => provider.enabled);
      if (enabled) providerId.value = enabled.id;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
    }

    unsubscribe = subscribeAgentEvents(handleEvent);
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
   * 追加实时事件；无论当前是否选中都缓存。
   */
  const handleEvent = (event: NexusEvent): void => {
    const list = eventsBySession[event.sessionId] ?? [];
    list.push(event);
    eventsBySession[event.sessionId] = list;

    if (event.type === 'run.started') {
      runningBySession[event.sessionId] = true;
      if (event.runId) runIds[event.sessionId] = event.runId;
    } else if (
      event.type === 'run.completed' ||
      event.type === 'run.failed' ||
      event.type === 'run.cancelled'
    ) {
      runningBySession[event.sessionId] = false;
      delete runIds[event.sessionId];
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
    if (rootPaths.value.length === 0) {
      error.value = t('chat.needsRoot');
      return;
    }

    error.value = undefined;
    runningBySession[sessionId] = true;
    try {
      const result = await runAgent({
        sessionId,
        prompt,
        rootPaths: rootPaths.value,
        providerId: providerId.value
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
   * 切换当前模型。
   */
  const setProvider = (id: string): void => {
    providerId.value = id;
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
    rootPaths,
    error,
    eventsBySession,
    runningBySession,
    initialize,
    dispose,
    loadHistory,
    send,
    stop,
    decideApproval,
    addRoot,
    setProvider,
    clearError
  };
});
