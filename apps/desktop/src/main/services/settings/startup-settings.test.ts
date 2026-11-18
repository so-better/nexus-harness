/**
 * 开机自启偏好测试：默认开启、持久化关闭与开发态不注册。
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loginItems = vi.hoisted(() => ({ set: vi.fn() }));

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    setLoginItemSettings: loginItems.set
  }
}));

import {
  applyAutoLaunch,
  initializeAutoLaunch,
  loadAutoLaunch,
  saveAutoLaunch
} from './startup-settings';

describe('startup settings', () => {
  let directory = '';

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nexus-startup-'));
    loginItems.set.mockClear();
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('defaults to enabled when no setting exists', async () => {
    await expect(loadAutoLaunch(directory)).resolves.toBe(true);
  });

  it('persists a disabled preference', async () => {
    await saveAutoLaunch(false, directory);

    await expect(loadAutoLaunch(directory)).resolves.toBe(false);
  });

  it('does not register login items in development', () => {
    expect(applyAutoLaunch(true)).toBe(true);
    expect(loginItems.set).not.toHaveBeenCalled();
  });

  it('initializes first run as enabled and persists the choice', async () => {
    await expect(initializeAutoLaunch(directory)).resolves.toBe(true);
    await expect(loadAutoLaunch(directory)).resolves.toBe(true);
  });

  it('keeps an existing disabled preference', async () => {
    await saveAutoLaunch(false, directory);

    await expect(initializeAutoLaunch(directory)).resolves.toBe(false);
  });
});
