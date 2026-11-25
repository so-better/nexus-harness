/**
 * list_dir 测试：目录内容与排序。
 */

import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runListDirTool } from './index';

describe('list_dir', () => {
  let root = '';

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'nexus-list-')));
    await mkdir(join(root, 'b-dir'));
    await writeFile(join(root, 'a.txt'), 'a');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('lists files and directories', async () => {
    const result = await runListDirTool({ roots: [root], primaryRoot: root }, {});
    expect(result.ok).toBe(true);
    expect(result.output).toContain('dir b-dir');
    expect(result.output).toContain('file a.txt');
    expect(result.output.indexOf('a.txt')).toBeLessThan(result.output.indexOf('b-dir'));
  });

  it('paginates entries with offset and limit', async () => {
    await writeFile(join(root, 'c.txt'), 'c');

    const page = await runListDirTool(
      { roots: [root], primaryRoot: root },
      { offset: 1, limit: 1 }
    );

    // 排序后为 a.txt / b-dir / c.txt，offset=1 取到 b-dir
    expect(page.output).toContain('b-dir');
    expect(page.output).not.toContain('a.txt');
    expect(page.output).toContain('offset=2');
  });
});
