/**
 * Agent 生成状态：统一运行级和消息级提示条件。
 */
import { describe, expect, it } from 'vitest';
import type { ChatMessageView, ChatProjection } from './types';
import {
  hasStreamingText,
  isAgentThinking,
  isAssistantTyping,
  shouldShowMessageThinking,
  shouldShowRunThinking
} from './agent-generation';

const projection = (overrides: Partial<ChatProjection> = {}): ChatProjection =>
  ({
    messages: [],
    approvals: [],
    askUsers: [],
    usage: { inputTokens: 0, outputTokens: 0, cost: 0 },
    running: true,
    status: 'running',
    ...overrides
  }) as ChatProjection;

const message = (overrides: Partial<ChatMessageView> = {}): ChatMessageView => ({
  id: 'm1',
  role: 'assistant',
  content: '',
  toolCalls: [],
  createdAt: 0,
  ...overrides
});

describe('agent generation state', () => {
  it('shows run thinking only while actively running without blockers', () => {
    expect(isAgentThinking(projection(), false)).toBe(true);
    expect(isAgentThinking(projection({ running: false, status: 'idle' }), false, true)).toBe(true);
    expect(isAgentThinking(projection({ status: 'waiting_approval' }), false)).toBe(false);
    expect(isAgentThinking(projection(), true)).toBe(false);
    expect(
      isAgentThinking(
        projection({ approvals: [{ id: 'a', toolCallId: 't', scope: 'tool', status: 'pending' }] }),
        false
      )
    ).toBe(false);
    expect(
      isAgentThinking(
        projection({ askUsers: [{ requestId: 'q', questions: [], status: 'pending' }] }),
        false
      )
    ).toBe(false);
  });

  it('hides run thinking as soon as an assistant is streaming', () => {
    expect(shouldShowRunThinking(true, [message()])).toBe(true);
    expect(shouldShowRunThinking(true, [message({ streaming: true })])).toBe(false);
  });

  it('only shows the inline cursor when no streaming text or blocker exists', () => {
    const base = {
      isTyping: true,
      hasInterruption: false,
      hasPendingAsk: false,
      hasStreamingText: false
    };
    expect(shouldShowMessageThinking(base)).toBe(true);
    expect(shouldShowMessageThinking({ ...base, hasStreamingText: true })).toBe(false);
    expect(shouldShowMessageThinking({ ...base, hasInterruption: true })).toBe(false);
    expect(shouldShowMessageThinking({ ...base, hasPendingAsk: true })).toBe(false);
    expect(shouldShowMessageThinking({ ...base, isTyping: false })).toBe(false);
  });

  it('does not leave an inline cursor after a timeline reply finishes', () => {
    expect(
      isAssistantTyping({
        role: 'assistant',
        streaming: false,
        hasTimeline: true,
        visibleContent: '',
        content: 'done'
      })
    ).toBe(false);
    expect(
      isAssistantTyping({
        role: 'assistant',
        streaming: false,
        hasTimeline: false,
        visibleContent: 'do',
        content: 'done'
      })
    ).toBe(true);
    expect(
      isAssistantTyping({
        role: 'assistant',
        streaming: true,
        hasTimeline: true,
        visibleContent: 'done',
        content: 'done'
      })
    ).toBe(true);
  });

  it('detects streaming text in timeline and fallback messages', () => {
    expect(
      hasStreamingText(
        message({
          timeline: [{ kind: 'content', id: 's1', text: 'hello', streaming: true }]
        }),
        true
      )
    ).toBe(true);
    expect(hasStreamingText(message({ content: 'hello' }), true)).toBe(true);
    expect(hasStreamingText(message({ content: 'hello' }), false)).toBe(false);
  });
});
