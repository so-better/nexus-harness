/**
 * Provider 自定义请求头解析测试。
 */
import { describe, expect, it } from 'vitest';
import { parseHeaders } from './provider-headers';

describe('parseHeaders', () => {
  it('parses a string record and treats empty text as empty', () => {
    expect(parseHeaders('', 'invalid')).toEqual({});
    expect(parseHeaders('{"X-Api-Version":"2024-01"}', 'invalid')).toEqual({
      'X-Api-Version': '2024-01'
    });
  });

  it('rejects non-object, array and non-string values', () => {
    expect(() => parseHeaders('{', 'invalid')).toThrow('invalid');
    expect(() => parseHeaders('[]', 'invalid')).toThrow('invalid');
    expect(() => parseHeaders('{"X":1}', 'invalid')).toThrow('invalid');
  });
});
