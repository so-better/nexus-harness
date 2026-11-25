/**
 * 「继续」入口判定：仅步数上限失败、未运行且已配置模型时提供。
 */
import { describe, expect, it } from 'vitest';
import type { ChatMessageView, ChatProjection } from './types';
import { continuePromptFor, shouldOfferContinue } from './continue-run';

const base: ChatProjection = {
  messages: [],
  approvals: [],
  askUsers: [],
  usage: { inputTokens: 0, outputTokens: 0, cost: 0 },
  running: false,
  status: 'failed',
  errorCode: 'RUN_MAX_STEPS'
};

describe('shouldOfferContinue', () => {
  it('offers continue for a max-steps failure with a model available', () => {
    expect(shouldOfferContinue(base, { running: false, hasModel: true })).toBe(true);
  });

  it('hides while running', () => {
    expect(shouldOfferContinue(base, { running: true, hasModel: true })).toBe(false);
  });

  it('hides when no model is configured', () => {
    expect(shouldOfferContinue(base, { running: false, hasModel: false })).toBe(false);
  });

  it('hides for other failure codes', () => {
    expect(
      shouldOfferContinue(
        { ...base, errorCode: 'PROVIDER_TIMEOUT' },
        { running: false, hasModel: true }
      )
    ).toBe(false);
  });

  it('hides when the run did not fail', () => {
    expect(
      shouldOfferContinue({ ...base, status: 'completed' }, { running: false, hasModel: true })
    ).toBe(false);
  });
});

const userMessage = (content: string): ChatMessageView => ({
  id: `u-${content}`,
  role: 'user',
  content,
  toolCalls: [],
  createdAt: 0
});

const assistantMessage = (content: string): ChatMessageView => ({
  id: `a-${content}`,
  role: 'assistant',
  content,
  toolCalls: [],
  createdAt: 0
});

describe('continuePromptFor', () => {
  it('follows Chinese conversation regardless of UI locale', () => {
    expect(continuePromptFor([userMessage('帮我回填订单')])).toBe('继续');
  });

  it('uses English for an English conversation', () => {
    expect(continuePromptFor([userMessage('please continue the task')])).toBe('Continue');
  });

  it('uses the latest user message', () => {
    expect(
      continuePromptFor([
        userMessage('帮我回填订单'),
        assistantMessage('好的'),
        userMessage('run the tests please')
      ])
    ).toBe('Continue');
  });

  it('defaults to English without a user message', () => {
    expect(continuePromptFor([])).toBe('Continue');
  });
});
