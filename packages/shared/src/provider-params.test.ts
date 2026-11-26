/**
 * Provider 参数校验：保留字段、敏感字段与思考字段名。
 */
import { describe, expect, it } from 'vitest';
import { isValidReasoningField, sanitizeProviderParams } from './provider-params';

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

describe('isValidReasoningField', () => {
  it('accepts empty and identifier names', () => {
    expect(isValidReasoningField(undefined)).toBe(true);
    expect(isValidReasoningField('')).toBe(true);
    expect(isValidReasoningField('reasoning_content')).toBe(true);
    expect(isValidReasoningField('reasoning')).toBe(true);
  });

  it('rejects reserved message fields and invalid identifiers', () => {
    expect(isValidReasoningField('content')).toBe(false);
    expect(isValidReasoningField('role')).toBe(false);
    expect(isValidReasoningField('tool_calls')).toBe(false);
    expect(isValidReasoningField('has space')).toBe(false);
    expect(isValidReasoningField('1field')).toBe(false);
  });
});
