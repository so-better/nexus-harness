/**
 * Agent 生成状态：统一首 token 前占位、流式末尾提示和消息内光标的条件。
 */
import type { ChatMessageView, ChatProjection } from './types';

export const isAgentThinking = (
  projection: ChatProjection,
  hasWorkspaceAuth: boolean,
  starting = false
): boolean => {
  if (!projection.running && !starting) return false;
  if (!starting && projection.status !== 'running') return false;
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

export interface AssistantTypingState {
  role: ChatMessageView['role'];
  streaming: boolean;
  hasTimeline: boolean;
  visibleContent: string;
  content: string;
}

/**
 * 判断助手是否仍在追赶可见文本。
 * 有时间线时只认 segment 的流式状态，避免历史内容与可见文本不一致导致光标常驻。
 */
export const isAssistantTyping = (state: AssistantTypingState): boolean =>
  state.role === 'assistant' &&
  (state.streaming ||
    (!state.hasTimeline && state.visibleContent !== state.content));

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
