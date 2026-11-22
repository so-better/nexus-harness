/**
 * 启动动画选择广播：保存选择并通知所有存活窗口。
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { loadStartupSelection } from './startup-animation-settings';

const state = vi.hoisted(() => ({
  windows: [
    {
      isDestroyed: () => false,
      webContents: { send: vi.fn() }
    },
    {
      isDestroyed: () => true,
      webContents: { send: vi.fn() }
    }
  ]
}));

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => state.windows }
}));

import { applyStartupSelection } from './startup-animation-service';

describe('startup animation selection service', () => {
  let directory = '';

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nexus-startup-animation-service-'));
    state.windows[0]?.webContents.send.mockClear();
    state.windows[1]?.webContents.send.mockClear();
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('persists and broadcasts the selection to live windows only', async () => {
    const selection = { pluginId: 'nexus.startup-intro', startupId: 'fade' };

    await expect(applyStartupSelection(selection, directory)).resolves.toEqual(selection);
    await expect(loadStartupSelection(directory)).resolves.toEqual(selection);
    expect(state.windows[0]?.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.settingsStartupChanged,
      { selection, source: 'settings' }
    );
    expect(state.windows[1]?.webContents.send).not.toHaveBeenCalled();
  });
});
