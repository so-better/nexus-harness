/**
 * userData 目录初始化测试：所有运行时目录都被创建。
 */

import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ directory: '' }));

vi.mock('electron', () => ({
  app: {
    getPath: () => state.directory
  }
}));

import { ensureAppDataDirectories, getAppDataPaths } from './paths';

describe('app data paths', () => {
  beforeEach(async () => {
    state.directory = await mkdtemp(join(tmpdir(), 'nexus-data-'));
  });

  afterEach(async () => {
    await rm(state.directory, { recursive: true, force: true });
  });

  it('creates every runtime directory', async () => {
    await ensureAppDataDirectories();
    const paths = getAppDataPaths();

    for (const directory of [
      paths.plugins,
      paths.skills,
      paths.mcp,
      paths.settings,
      paths.files,
      paths.artifacts,
      paths.checkpoints,
      paths.logs
    ]) {
      await expect(stat(directory)).resolves.toBeDefined();
    }
  });
});
