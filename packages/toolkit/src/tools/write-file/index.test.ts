/**
 * write_file 测试：写入、创建目录与 root 限制。
 */

import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runWriteFileTool } from './index';

describe('write_file', () => {
  let root = '';

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'nexus-write-')));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('writes a file and creates parent directories', async () => {
    const result = await runWriteFileTool(
      { roots: [root], primaryRoot: root },
      { path: 'nested/a.txt', content: 'hello', createDirs: true }
    );
    expect(result.ok).toBe(true);
    expect(await readFile(join(root, 'nested/a.txt'), 'utf8')).toBe('hello');
  });

  it('rejects paths outside the root', async () => {
    await expect(
      runWriteFileTool(
        { roots: [root], primaryRoot: root },
        { path: '../outside.txt', content: 'x' }
      )
    ).rejects.toMatchObject({ code: 'PATH_OUTSIDE_ROOT' });
  });
});
