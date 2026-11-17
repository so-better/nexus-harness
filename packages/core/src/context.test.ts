/* 上下文预算测试：估算、预算边界与压缩触发线。 */

import { describe, expect, it } from 'vitest';
import { createContextBudget, estimateMessagesTokens, estimateTextTokens } from './context';

describe('context budget', () => {
  it('estimates mixed CJK and ASCII text', () => {
    expect(estimateTextTokens('你好')).toBe(2);
    expect(estimateTextTokens('hello world')).toBe(3);
    expect(estimateTextTokens('')).toBe(0);
  });

  it('counts messages and tool schemas', () => {
    const messages = [
      { role: 'user' as const, content: 'hello' },
      { role: 'assistant' as const, content: '你好' }
    ];
    const tools = [{ name: 'read_file', description: 'read', inputSchema: {} }];

    expect(estimateMessagesTokens(messages)).toBeGreaterThan(0);
    expect(estimateMessagesTokens(messages, tools)).toBeGreaterThan(
      estimateMessagesTokens(messages)
    );
  });

  it('reserves output and safety tokens', () => {
    const budget = createContextBudget({ contextWindow: 10_000, maxOutputTokens: 2_000 });

    expect(budget.maxOutputTokens).toBe(2_000);
    expect(budget.safetyTokens).toBe(512);
    expect(budget.inputBudget).toBe(7_488);
    expect(budget.compactAt).toBe(Math.floor(7_488 * 0.7));
  });

  it('never returns a negative input budget', () => {
    const budget = createContextBudget({ contextWindow: 1_000, maxOutputTokens: 999 });

    expect(budget.maxOutputTokens).toBe(999);
    expect(budget.inputBudget).toBe(1);
  });

  it('rejects invalid windows', () => {
    expect(() => createContextBudget({ contextWindow: 0 })).toThrow('contextWindow');
  });
});
