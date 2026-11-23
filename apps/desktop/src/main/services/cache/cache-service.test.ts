/**
 * 缓存服务测试：目录统计、单类清理与全部清理。
 */

import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearCache, getCacheInfo, type CacheDirectories } from './cache-service';

describe('cache service', () => {
  let root = '';
  let directories: CacheDirectories;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'nexus-cache-'));
    directories = {
      files: join(root, 'files'),
      artifacts: join(root, 'artifacts'),
      logs: join(root, 'logs'),
      mcpWorkdir: join(root, 'mcp', 'workdir')
    };
    await mkdir(join(directories.files, 'session-1'), { recursive: true });
    await mkdir(directories.artifacts, { recursive: true });
    await mkdir(directories.logs, { recursive: true });
    await mkdir(directories.mcpWorkdir, { recursive: true });
    await writeFile(join(directories.files, 'session-1', 'output.txt'), '12345');
    await writeFile(join(directories.artifacts, 'artifact.txt'), '1234567');
    await writeFile(join(directories.logs, 'main.log'), '123');
    await writeFile(join(directories.mcpWorkdir, 'scratch.txt'), '12');
    await writeFile(join(directories.mcpWorkdir, 'page.yml'), '345');
    await writeFile(join(root, 'mcp', 'mcp.json'), '{}');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reports recursive sizes', async () => {
    await expect(getCacheInfo(directories)).resolves.toEqual({
      filesBytes: 5,
      artifactsBytes: 7,
      logsBytes: 3,
      mcpBytes: 5,
      totalBytes: 20,
      failed: []
    });
  });

  it('clears one cache category and keeps the directory', async () => {
    const info = await clearCache(directories, 'files');

    expect(info.filesBytes).toBe(0);
    expect(info.artifactsBytes).toBe(7);
    expect(info.mcpBytes).toBe(5);
    expect(info.failed).toEqual([]);
    await expect(readFile(join(directories.files, 'session-1', 'output.txt'))).rejects.toThrow();
  });

  it('keeps context-history snapshots when clearing artifacts', async () => {
    await writeFile(join(directories.artifacts, 'context-history-snapshot.txt'), 'snapshot');

    await clearCache(directories, 'artifacts');

    await expect(readFile(join(directories.artifacts, 'artifact.txt'))).rejects.toThrow();
    await expect(
      readFile(join(directories.artifacts, 'context-history-snapshot.txt'), 'utf8')
    ).resolves.toBe('snapshot');
  });

  it('clears MCP scratch files without deleting MCP config or workdir', async () => {
    const info = await clearCache(directories, 'mcp');

    expect(info.mcpBytes).toBe(0);
    expect(info.failed).toEqual([]);
    await expect(readFile(join(directories.mcpWorkdir, 'scratch.txt'))).rejects.toThrow();
    await expect(readFile(join(directories.mcpWorkdir, 'page.yml'))).rejects.toThrow();
    await expect(readFile(join(root, 'mcp', 'mcp.json'), 'utf8')).resolves.toBe('{}');
  });

  it.skipIf(process.platform === 'win32')('does not follow a symlinked MCP workdir', async () => {
    const outside = join(root, 'outside');
    await mkdir(outside, { recursive: true });
    const secret = join(outside, 'secret.txt');
    await writeFile(secret, 'keep');
    await rm(directories.mcpWorkdir, { recursive: true, force: true });
    await symlink(outside, directories.mcpWorkdir);

    const info = await clearCache(directories, 'mcp');

    expect(info.failed).toEqual([]);
    await expect(readFile(secret, 'utf8')).resolves.toBe('keep');
    expect((await lstat(directories.mcpWorkdir)).isDirectory()).toBe(true);
  });

  it('clears all cache categories', async () => {
    const info = await clearCache(directories, 'all');

    expect(info.totalBytes).toBe(0);
    await expect(readFile(join(directories.artifacts, 'artifact.txt'))).rejects.toThrow();
    await expect(readFile(join(directories.logs, 'main.log'))).rejects.toThrow();
  });
});
