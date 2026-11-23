/**
 * 额外请求参数 JSON 解析测试。
 */
import { describe, expect, it } from 'vitest';
import { parseExtraParams } from './extra-params';

describe('parseExtraParams', () => {
  it('accepts empty text and objects', () => {
    expect(parseExtraParams('', 'invalid')).toEqual({});
    expect(parseExtraParams('{"thinking":{"type":"enabled"}}', 'invalid')).toEqual({
      thinking: { type: 'enabled' }
    });
  });

  it('rejects invalid JSON, arrays and primitives', () => {
    expect(() => parseExtraParams('{', 'invalid')).toThrow('invalid');
    expect(() => parseExtraParams('[]', 'invalid')).toThrow('invalid');
    expect(() => parseExtraParams('null', 'invalid')).toThrow('invalid');
  });
});
