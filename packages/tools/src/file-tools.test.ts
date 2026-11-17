/* 文件工具测试：读取、列目录与路径越界保护。 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFileToolset } from './file-tools';

describe('file tools', () => {
  let root = '';
  let toolset: Awaited<ReturnType<typeof createFileToolset>>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'nexus-tools-'));
    await writeFile(join(root, 'a.txt'), 'hello', 'utf8');
    toolset = await createFileToolset([root]);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reads a text file inside the root', async () => {
    const result = await toolset.execute('read_file', { path: 'a.txt' });

    expect(result).toEqual({ ok: true, output: 'hello' });
  });

  it('only reads the requested prefix for large files', async () => {
    await writeFile(join(root, 'large.txt'), 'x'.repeat(1000), 'utf8');

    const result = await toolset.execute('read_file', { path: 'large.txt', maxBytes: 10 });

    expect(result.ok).toBe(true);
    expect(result.output.startsWith('xxxxxxxxxx')).toBe(true);
    expect(result.output).toContain('已截断');
  });

  it('lists directory entries', async () => {
    const result = await toolset.execute('list_dir', {});

    expect(result.ok).toBe(true);
    expect(result.output).toContain('file a.txt');
  });

  it('rejects paths outside the root', async () => {
    const result = await toolset.execute('read_file', { path: '../outside.txt' });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('PATH_OUTSIDE_ROOT');
  });

  it('reports missing files', async () => {
    const result = await toolset.execute('read_file', { path: 'missing.txt' });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('FILE_NOT_FOUND');
  });

  it('rejects binary files', async () => {
    await writeFile(join(root, 'binary.bin'), Buffer.from([0, 1, 2]));

    const result = await toolset.execute('read_file', { path: 'binary.bin' });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('BINARY_FILE');
  });
});
