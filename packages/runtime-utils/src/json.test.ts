/**
 * deepSortKeys：递归按键排序，保证 JSON 序列化稳定。
 */

import { describe, expect, it } from 'vitest';
import { deepSortKeys } from './json';

describe('deepSortKeys', () => {
  it('sorts object keys recursively', () => {
    const result = deepSortKeys({ b: 1, a: { d: 2, c: 3 } }) as Record<string, unknown>;
    expect(result).toEqual({ a: { c: 3, d: 2 }, b: 1 });
    expect(Object.keys(result.a as Record<string, unknown>)).toEqual(['c', 'd']);
  });

  it('produces identical output regardless of key order', () => {
    const first = { x: { p: 1, q: 2 }, y: [3, 4] };
    const second = { y: [3, 4], x: { q: 2, p: 1 } };
    expect(JSON.stringify(deepSortKeys(first))).toBe(JSON.stringify(deepSortKeys(second)));
  });

  it('preserves array order while processing elements', () => {
    const result = deepSortKeys({ list: [{ b: 1, a: 2 }, 3] }) as { list: unknown[] };
    expect(result.list[0]).toEqual({ a: 2, b: 1 });
    expect(result.list[1]).toBe(3);
  });

  it('returns primitives unchanged', () => {
    expect(deepSortKeys('x')).toBe('x');
    expect(deepSortKeys(5)).toBe(5);
    expect(deepSortKeys(null)).toBe(null);
  });
});
