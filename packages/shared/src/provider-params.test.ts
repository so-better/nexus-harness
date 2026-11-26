/**
 * Provider 参数校验：DeepSeek 识别、保留字段与敏感字段过滤。
 */
import { describe, expect, it } from 'vitest';
import { isDeepSeekBaseUrl, sanitizeProviderParams } from './provider-params';

describe('isDeepSeekBaseUrl', () => {
  it('matches DeepSeek hosts', () => {
    expect(isDeepSeekBaseUrl('https://api.deepseek.com')).toBe(true);
    expect(isDeepSeekBaseUrl('https://api.deepseek.com/v1')).toBe(true);
    expect(isDeepSeekBaseUrl('https://deepseek.com')).toBe(true);
    // 缺省协议也能识别
    expect(isDeepSeekBaseUrl('api.deepseek.com')).toBe(true);
    expect(isDeepSeekBaseUrl('api.deepseek.com/v1')).toBe(true);
  });

  it('rejects other hosts and invalid URLs', () => {
    expect(isDeepSeekBaseUrl('https://api.openai.com')).toBe(false);
    expect(isDeepSeekBaseUrl('https://notdeepseek.com')).toBe(false);
    expect(isDeepSeekBaseUrl('not a url')).toBe(false);
  });
});

describe('sanitizeProviderParams', () => {
  it('passes unknown params through and strips reserved and sensitive keys', () => {
    expect(
      sanitizeProviderParams({
        thinking: { type: 'enabled' },
        reasoning_effort: 'high',
        custom: 1,
        model: 'override',
        api_key: 'secret'
      })
    ).toEqual({ thinking: { type: 'enabled' }, reasoning_effort: 'high', custom: 1 });
  });

  it('returns undefined when nothing remains', () => {
    expect(sanitizeProviderParams(undefined)).toBeUndefined();
    expect(sanitizeProviderParams({ model: 'x' })).toBeUndefined();
  });
});
