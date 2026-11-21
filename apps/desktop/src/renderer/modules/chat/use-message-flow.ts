/**
 * 消息时间线与工具/提问/目录授权派生状态。
 */
import { computed } from 'vue';
import type { ChatApproval, ChatAskUser, ChatMessageView } from './types';
import type { WorkspaceAuthorizationRequest } from '@shared/ipc/contracts';
import { buildToolEntries, unmatchedAskUsers } from './ask-tool-entries';
import { isToolInterruption } from './message-flow-lookups';

interface MessageFlowDeps {
  message: () => ChatMessageView;
  askUsers: () => ChatAskUser[];
  approvals: () => ChatApproval[];
  sessionId: () => string | undefined;
  workspaceAuth: () => WorkspaceAuthorizationRequest | null | undefined;
  workspaceAuthToolExists: () => boolean;
  isLastAssistant: () => boolean;
}

export const useMessageFlow = (deps: MessageFlowDeps) => {
  const timeline = computed(() => deps.message().timeline ?? []);
  const toolEntries = computed(() => buildToolEntries(deps.message().toolCalls, deps.askUsers()));
  const unmatchedAsks = computed(() => {
    const matchedByTimeline = new Set(
      timeline.value.flatMap((segment) => (segment.kind === 'ask' ? [segment.requestId] : []))
    );
    return unmatchedAskUsers(toolEntries.value, deps.askUsers()).filter(
      (ask) => !matchedByTimeline.has(ask.requestId)
    );
  });

  const relatedWorkspaceAuth = computed<WorkspaceAuthorizationRequest | null>(() => {
    const request = deps.workspaceAuth();
    return request && request.sessionId === deps.sessionId() ? request : null;
  });

  /**
   * 工具调用尚未投影到界面时，授权卡仍必须可见，不能因为 ID 匹配失败而消失。
   */
  const orphanWorkspaceAuth = computed<WorkspaceAuthorizationRequest | null>(() => {
    const request = relatedWorkspaceAuth.value;
    if (!request || !deps.isLastAssistant() || deps.workspaceAuthToolExists()) return null;
    return request;
  });

  const hasInterruption = computed(
    () =>
      Boolean(orphanWorkspaceAuth.value) ||
      toolEntries.value.some(
        (entry) =>
          entry.kind === 'tool' &&
          isToolInterruption(entry.tool, deps.approvals(), relatedWorkspaceAuth.value)
      )
  );
  const hasPendingAsk = computed(() => deps.askUsers().some((ask) => ask.status === 'pending'));

  /**
   * 复制时优先使用时间线里的正文段，避免与渲染顺序/拼接字段不一致。
   */
  const copyText = computed(() => {
    const segments = deps.message().timeline ?? [];
    if (!segments.length) return deps.message().content;
    return segments
      .filter((segment) => segment.kind === 'content')
      .map((segment) => segment.text)
      .join('\n\n');
  });

  return {
    timeline,
    toolEntries,
    unmatchedAsks,
    relatedWorkspaceAuth,
    orphanWorkspaceAuth,
    hasInterruption,
    hasPendingAsk,
    copyText
  };
};
