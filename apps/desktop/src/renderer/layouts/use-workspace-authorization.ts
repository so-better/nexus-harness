/**
 * 主布局工作区授权：目录选择、授权请求与审批回应。
 */
import { computed, ref } from 'vue';
import { useMessage } from 'naive-ui';
import { storeToRefs } from 'pinia';
import type { WorkspaceAuthorizationRequest } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import { resolveWorkspaceAuthorization } from '@/modules/chat/api/workspace.api';
import { useChatStore } from '@/modules/chat/stores/chat.store';
import { useSessionStore } from '@/modules/session/stores/session.store';

export const useWorkspaceAuthorization = () => {
  const sessions = useSessionStore();
  const chat = useChatStore();
  const message = useMessage();
  const { activeId } = storeToRefs(sessions);
  const { providerId, modelId } = storeToRefs(chat);
  const workspaceAuthRequests = ref<Record<string, WorkspaceAuthorizationRequest>>({});
  const workspaceAuthRequest = computed(() => {
    const sessionId = activeId.value;
    return sessionId ? (workspaceAuthRequests.value[sessionId] ?? null) : null;
  });

  /**
   * 添加工作区；没有会话时先创建。
   */
  const authorizeWorkspace = async (): Promise<boolean> => {
    if (!activeId.value) {
      const created = await sessions.create(providerId.value, modelId.value);
      if (!created) {
        message.error(sessions.error ?? t('session.createFailed'));
        return false;
      }
    }
    if (!activeId.value) return false;

    const result = await chat.addRoot(activeId.value);
    if (result === 'failed') {
      message.error(chat.error ?? t('app.rootAddFailed'));
      return false;
    }
    return result === 'added';
  };

  const authorizeRootAndRetry = async (): Promise<void> => {
    if (await authorizeWorkspace()) message.info(t('app.rootAuthorizedRetry'));
  };

  const chooseRoot = async (): Promise<void> => {
    await authorizeWorkspace();
  };

  const removeRoot = async (rootId: string): Promise<void> => {
    if (!activeId.value) return;
    const removed = await chat.removeRoot(activeId.value, rootId);
    if (!removed) {
      message.error(chat.error ?? t('app.rootRemoveFailed'));
      return;
    }
    if (sessions.activeSession?.approvalPolicy === 'workspace' && chat.roots.length === 0) {
      await sessions.updateApprovalPolicy(activeId.value, 'ask');
    }
  };

  /**
   * 移除某个会话的授权请求；其他会话的请求保持不变。
   */
  const clearWorkspaceRequest = (sessionId: string): void => {
    const next = { ...workspaceAuthRequests.value };
    delete next[sessionId];
    workspaceAuthRequests.value = next;
  };

  const allowWorkspace = async (): Promise<void> => {
    const request = workspaceAuthRequest.value;
    if (!request) return;
    try {
      if (
        await resolveWorkspaceAuthorization({
          requestId: request.requestId,
          decision: 'approved'
        })
      ) {
        clearWorkspaceRequest(request.sessionId);
      }
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : t('app.rootAddFailed'));
    }
  };

  const rejectWorkspace = async (): Promise<void> => {
    const request = workspaceAuthRequest.value;
    if (!request) return;
    try {
      if (
        await resolveWorkspaceAuthorization({
          requestId: request.requestId,
          decision: 'rejected'
        })
      ) {
        clearWorkspaceRequest(request.sessionId);
      }
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : t('app.rootAddFailed'));
    }
  };

  return {
    workspaceAuthRequests,
    workspaceAuthRequest,
    authorizeRootAndRetry,
    chooseRoot,
    removeRoot,
    allowWorkspace,
    rejectWorkspace,
    clearWorkspaceRequest
  };
};
