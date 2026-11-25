/**
 * read_file 测试：文本读取、截断与 root 限制。
 */

import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runReadFileTool } from './index';

describe('read_file', () => {
  let root = '';

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'nexus-read-')));
    await writeFile(join(root, 'a.txt'), 'hello world');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reads a text file inside the root', async () => {
    const result = await runReadFileTool({ roots: [root], primaryRoot: root }, { path: 'a.txt' });
    expect(result).toEqual({ ok: true, output: 'hello world' });
  });

  it('truncates when maxBytes is exceeded', async () => {
    const result = await runReadFileTool(
      { roots: [root], primaryRoot: root },
      { path: 'a.txt', maxBytes: 5 }
    );
    expect(result.output).toContain('hello');
    expect(result.output).toContain('已截断');
  });

  it('reads the full file when it fits within maxBytes', async () => {
    const content = 'line1\n'.repeat(3_000);
    await writeFile(join(root, 'big.txt'), content);

    const result = await runReadFileTool({ roots: [root], primaryRoot: root }, { path: 'big.txt' });

    expect(result.output).toBe(content);
  });

  it('returns empty output for an empty file', async () => {
    await writeFile(join(root, 'empty.txt'), '');

    const result = await runReadFileTool(
      { roots: [root], primaryRoot: root },
      { path: 'empty.txt' }
    );

    expect(result).toEqual({ ok: true, output: '' });
  });

  it('reads from an offset with a bounded chunk', async () => {
    await writeFile(join(root, 'b.txt'), '0123456789');

    const result = await runReadFileTool(
      { roots: [root], primaryRoot: root },
      { path: 'b.txt', offset: 4, maxBytes: 3 }
    );

    expect(result.output).toContain('456');
    expect(result.output).toContain('已截断');
    expect(result.output).toContain('offset=7');
  });

  it('rejects paths outside the root', async () => {
    await expect(
      runReadFileTool({ roots: [root], primaryRoot: root }, { path: '../outside.txt' })
    ).rejects.toMatchObject({ code: 'PATH_OUTSIDE_ROOT' });
  });
});
