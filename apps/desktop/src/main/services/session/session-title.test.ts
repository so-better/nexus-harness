/**
 * 自动标题测试：清洗、截断与异常兜底。
 */

import { describe, expect, it } from 'vitest';
import { fallbackTitle, sanitizeTitle } from './session-title';

describe('session title helpers', () => {
  it('cleans markdown and quotes', () => {
    expect(sanitizeTitle('## “修复流式解析”')).toBe('修复流式解析');
  });

  it('truncates long titles', () => {
    expect(sanitizeTitle('a'.repeat(40))).toHaveLength(32);
  });

  it('falls back to the first prompt line', () => {
    expect(fallbackTitle('  修复 Provider 流式解析\n更多说明')).toBe('修复 Provider 流式解析');
  });
});
