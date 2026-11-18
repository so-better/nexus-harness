/**
 * 行级 diff 测试。
 */

import { describe, expect, it } from 'vitest';
import { buildLineDiff } from './diff';

describe('buildLineDiff', () => {
  it('marks removed and added lines around shared context', () => {
    expect(buildLineDiff('a\nb\nc', 'a\nB\nc')).toEqual([
      { key: 0, type: 'same', text: 'a' },
      { key: 1, type: 'removed', text: 'b' },
      { key: 2, type: 'added', text: 'B' },
      { key: 3, type: 'same', text: 'c' }
    ]);
  });

  it('handles created files', () => {
    expect(buildLineDiff('', 'a\nb')).toEqual([
      { key: 0, type: 'added', text: 'a' },
      { key: 1, type: 'added', text: 'b' }
    ]);
  });
});
