/**
 * 缓存服务测试：目录统计、单类清理与全部清理。
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
      logs: join(root, 'logs')
    };
    await mkdir(join(directories.files, 'session-1'), { recursive: true });
    await mkdir(directories.artifacts, { recursive: true });
    await mkdir(directories.logs, { recursive: true });
    await writeFile(join(directories.files, 'session-1', 'output.txt'), '12345');
    await writeFile(join(directories.artifacts, 'artifact.txt'), '1234567');
    await writeFile(join(directories.logs, 'main.log'), '123');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reports recursive sizes', async () => {
    await expect(getCacheInfo(directories)).resolves.toEqual({
      filesBytes: 5,
      artifactsBytes: 7,
      logsBytes: 3,
      totalBytes: 15,
      failed: []
    });
  });

  it('clears one cache category and keeps the directory', async () => {
    const info = await clearCache(directories, 'files');

    expect(info.filesBytes).toBe(0);
    expect(info.artifactsBytes).toBe(7);
    expect(info.failed).toEqual([]);
    await expect(readFile(join(directories.files, 'session-1', 'output.txt'))).rejects.toThrow();
  });

  it('clears all cache categories', async () => {
    const info = await clearCache(directories, 'all');

    expect(info.totalBytes).toBe(0);
    await expect(readFile(join(directories.artifacts, 'artifact.txt'))).rejects.toThrow();
    await expect(readFile(join(directories.logs, 'main.log'))).rejects.toThrow();
  });
});
