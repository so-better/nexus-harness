/**
 * Agent 生成状态：统一首 token 前占位、流式末尾提示和消息内光标的条件。
 */
import type { ChatMessageView, ChatProjection } from './types';

export const isAgentThinking = (
  projection: ChatProjection,
  hasWorkspaceAuth: boolean
): boolean => {
  if (!projection.running || projection.status !== 'running') return false;
  if (hasWorkspaceAuth) return false;
  if (projection.approvals.some((approval) => approval.status === 'pending')) return false;
  if (projection.askUsers.some((ask) => ask.status === 'pending')) return false;
  return true;
};

export const hasStreamingAssistant = (messages: ChatMessageView[]): boolean =>
  messages.some((message) => message.role === 'assistant' && message.streaming === true);

export const shouldShowRunThinking = (
  thinking: boolean,
  messages: ChatMessageView[]
): boolean => thinking && !hasStreamingAssistant(messages);

export const hasStreamingText = (message: ChatMessageView, isTyping: boolean): boolean => {
  const timeline = message.timeline ?? [];
  if (
    timeline.some(
      (segment) =>
        (segment.kind === 'content' || segment.kind === 'reasoning') && segment.streaming
    )
  ) {
    return true;
  }
  return (
    !timeline.length && Boolean(isTyping && (message.content || message.reasoning))
  );
};

export interface MessageThinkingState {
  isTyping: boolean;
  hasInterruption: boolean;
  hasPendingAsk: boolean;
  hasStreamingText: boolean;
}

export const shouldShowMessageThinking = (state: MessageThinkingState): boolean =>
  state.isTyping &&
  !state.hasInterruption &&
  !state.hasPendingAsk &&
  !state.hasStreamingText;
