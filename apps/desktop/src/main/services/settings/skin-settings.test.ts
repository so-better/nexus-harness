/**
 * 插件皮肤选择持久化测试。
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadSkinSelection, saveSkinSelection } from './skin-settings';

describe('skin settings', () => {
  let directory = '';

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nexus-skin-settings-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('defaults to no skin', async () => {
    await expect(loadSkinSelection(directory)).resolves.toBeNull();
  });

  it('persists and clears a skin selection', async () => {
    const selection = { pluginId: 'nexus.theme-background', skinId: 'paper' };
    await saveSkinSelection(selection, directory);
    await expect(loadSkinSelection(directory)).resolves.toEqual(selection);
    await saveSkinSelection(null, directory);
    await expect(loadSkinSelection(directory)).resolves.toBeNull();
  });
});
