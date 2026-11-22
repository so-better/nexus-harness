/**
 * 启动动画选择持久化测试。
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadStartupSelection, saveStartupSelection } from './startup-animation-settings';

describe('startup animation settings', () => {
  let directory = '';

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nexus-startup-animation-settings-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('defaults to no startup animation', async () => {
    await expect(loadStartupSelection(directory)).resolves.toBeNull();
  });

  it('persists and clears a startup animation selection', async () => {
    const selection = { pluginId: 'nexus.startup-intro', startupId: 'intro' };
    await saveStartupSelection(selection, directory);
    await expect(loadStartupSelection(directory)).resolves.toEqual(selection);
    await saveStartupSelection(null, directory);
    await expect(loadStartupSelection(directory)).resolves.toBeNull();
  });
});
