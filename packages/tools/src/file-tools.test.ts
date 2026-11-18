/**
 * 文件工具测试：读取、列目录与路径越界保护。
 */

import { access, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
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

  it('skips missing roots when at least one root is valid', async () => {
    const recovered = await createFileToolset([join(root, 'missing'), root]);
    const result = await recovered.execute('read_file', { path: 'a.txt' });
    expect(result).toEqual({ ok: true, output: 'hello' });
  });

  it('blocks sensitive paths even inside a valid root', async () => {
    const ssh = join(root, '.ssh');
    await mkdir(ssh);
    await writeFile(join(ssh, 'id_rsa'), 'secret', 'utf8');

    const result = await toolset.execute('read_file', { path: '.ssh/id_rsa' });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('PATH_SENSITIVE');
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

  it('writes and patches files inside the root', async () => {
    const written = await toolset.execute('write_file', {
      path: 'b.txt',
      content: 'hello'
    });
    expect(written.ok).toBe(true);

    const patched = await toolset.execute('apply_patch', {
      path: 'b.txt',
      oldText: 'hello',
      newText: 'world'
    });
    expect(patched.ok).toBe(true);

    const read = await toolset.execute('read_file', { path: 'b.txt' });
    expect(read.output).toBe('world');
  });

  it('blocks dangerous commands', async () => {
    const result = await toolset.execute('run_command', { command: 'rm -rf /' });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('COMMAND_BLOCKED');
  });

  it('runs safe commands with blocked cwd outside root', async () => {
    const result = await toolset.execute('run_command', { command: 'echo hello' });

    expect(result.ok).toBe(true);
    expect(result.output.trim()).toBe('hello');
  });

  it('does not follow symlinks outside the root when creating directories', async () => {
    if (process.platform === 'win32') return;

    const outside = await mkdtemp(join(tmpdir(), 'nexus-tools-outside-'));
    await symlink(outside, join(root, 'link'));
    try {
      const result = await toolset.execute('write_file', {
        path: 'link/new/file.txt',
        content: 'x',
        createDirs: true
      });

      expect(result.ok).toBe(false);
      await expect(access(join(outside, 'new', 'file.txt'))).rejects.toThrow();
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('rejects binary files', async () => {
    await writeFile(join(root, 'binary.bin'), Buffer.from([0, 1, 2]));

    const result = await toolset.execute('read_file', { path: 'binary.bin' });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('BINARY_FILE');
  });
});
