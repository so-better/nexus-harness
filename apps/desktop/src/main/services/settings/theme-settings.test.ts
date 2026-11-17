/* 主题偏好持久化测试：读写、默认值与损坏文件回退。 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ directory: '' }));

vi.mock('electron', () => ({
  app: {
    getPath: () => state.directory
  }
}));

import { loadThemeSource, saveThemeSource } from './theme-settings';

describe('theme settings', () => {
  beforeEach(async () => {
    state.directory = await mkdtemp(join(tmpdir(), 'nexus-theme-'));
  });

  afterEach(async () => {
    await rm(state.directory, { recursive: true, force: true });
  });

  it('falls back to system when no file exists', async () => {
    await expect(loadThemeSource()).resolves.toBe('system');
  });

  it('round-trips the theme source', async () => {
    await saveThemeSource('dark');

    await expect(loadThemeSource()).resolves.toBe('dark');
    const raw = JSON.parse(await readFile(join(state.directory, 'settings', 'theme.json'), 'utf8'));
    expect(raw.source).toBe('dark');
  });

  it('falls back to system on invalid content', async () => {
    await mkdir(join(state.directory, 'settings'), { recursive: true });
    await writeFile(join(state.directory, 'settings', 'theme.json'), '{invalid', 'utf8');

    await expect(loadThemeSource()).resolves.toBe('system');
  });
});
