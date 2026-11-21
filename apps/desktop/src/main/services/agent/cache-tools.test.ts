// @vitest-environment node
/**
 * 缓存工具：统计、清理与目标校验。
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppDataPaths } from '../storage/paths';
import { executeCacheTool } from './cache-tools';

vi.mock('electron', () => ({
  app: { getPath: () => '' },
  session: { defaultSession: { clearCache: vi.fn(async () => undefined) } }
}));

let root = '';
let paths: AppDataPaths;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'nexus-cache-tools-'));
  paths = {
    root,
    settings: join(root, 'settings'),
    files: join(root, 'files'),
    attachments: join(root, 'attachments'),
    artifacts: join(root, 'artifacts'),
    checkpoints: join(root, 'checkpoints'),
    logs: join(root, 'logs'),
    plugins: join(root, 'plugins'),
    skills: join(root, 'skills'),
    mcp: join(root, 'mcp')
  };
  await mkdir(paths.files, { recursive: true });
  await mkdir(paths.artifacts, { recursive: true });
  await mkdir(paths.logs, { recursive: true });
  await writeFile(join(paths.files, 'output.txt'), '12345');
  await writeFile(join(paths.artifacts, 'artifact.txt'), '1234567');
  await writeFile(join(paths.logs, 'main.log'), '123');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('cache tools', () => {
  it('reports and clears cache without deleting session data elsewhere', async () => {
    const initial = await executeCacheTool('cache_get_info', {}, { paths });
    expect(initial.ok).toBe(true);
    expect(JSON.parse(initial.output)).toMatchObject({ totalBytes: 15 });

    const cleared = await executeCacheTool('cache_clear', { target: 'files' }, { paths });
    expect(cleared.ok).toBe(true);
    expect(JSON.parse(cleared.output)).toMatchObject({
      filesBytes: 0,
      artifactsBytes: 7,
      logsBytes: 3
    });
  });

  it('rejects invalid cache targets', async () => {
    const result = await executeCacheTool('cache_clear', { target: 'sessions' }, { paths });
    expect(result).toMatchObject({ ok: false, error: { code: 'CACHE_INVALID_TARGET' } });
  });
});
