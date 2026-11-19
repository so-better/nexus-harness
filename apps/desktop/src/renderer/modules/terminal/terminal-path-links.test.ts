/**
 * 终端路径链接解析测试。
 */

import { describe, expect, it } from 'vitest';
import { findTerminalPathMatches } from './terminal-path-links';

describe('findTerminalPathMatches', () => {
  it('finds plain and quoted paths with spaces', () => {
    const matches = findTerminalPathMatches(
      'open /tmp/app.ts and \'/tmp/my file.ts\' plus "~/a b.txt"'
    );
    expect(matches.map((match) => match.text)).toEqual([
      '/tmp/app.ts',
      '/tmp/my file.ts',
      '~/a b.txt'
    ]);
  });

  it('keeps indexes at the path start', () => {
    const [match] = findTerminalPathMatches("x '/tmp/a b.ts'");
    expect(match?.index).toBe(3);
  });
});
