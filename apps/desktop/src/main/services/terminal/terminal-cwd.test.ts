/**
 * 终端默认目录测试：工作区优先，无工作区使用根目录。
 */

import { describe, expect, it } from 'vitest';
import { filesystemRoot, resolveTerminalCwd } from './terminal-cwd';

describe('terminal cwd', () => {
  it('uses the workspace root when available', () => {
    expect(resolveTerminalCwd('/tmp/workspace')).toBe('/tmp/workspace');
  });

  it('falls back to the filesystem root', () => {
    expect(resolveTerminalCwd(undefined)).toBe(filesystemRoot());
    expect(filesystemRoot('win32', 'D:')).toBe('D:\\');
    expect(filesystemRoot('darwin')).toBe('/');
  });
});
