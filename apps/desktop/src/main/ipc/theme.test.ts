/**
 * 主题 IPC 单元测试：参数校验、持久化与广播。
 */

import { IPC_CHANNELS } from '@shared/ipc/channels';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  windows: [] as Array<{
    isDestroyed: () => boolean;
    webContents: { send: (...args: unknown[]) => void };
  }>
}));

const saveThemeSource = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      state.handlers.set(channel, handler);
    }
  },
  nativeTheme: {
    themeSource: 'system',
    on: vi.fn()
  },
  BrowserWindow: {
    getAllWindows: () => state.windows
  }
}));

vi.mock('../app/theme', () => ({
  getThemeInfo: () => ({ source: 'system', effective: 'light' }),
  applyWindowBackground: vi.fn()
}));

vi.mock('../services/settings/theme-settings', () => ({ saveThemeSource }));

import { registerThemeIpc } from './theme';

describe('theme IPC', () => {
  beforeEach(() => {
    state.handlers.clear();
    state.windows = [
      {
        isDestroyed: () => false,
        webContents: { send: vi.fn() }
      }
    ];
    saveThemeSource.mockClear();
    registerThemeIpc();
  });

  it('persists and broadcasts a valid theme source', async () => {
    const handler = state.handlers.get(IPC_CHANNELS.themeSetSource);
    if (!handler) throw new Error('theme:setSource handler not registered');

    const result = await handler(null, 'dark');

    expect(saveThemeSource).toHaveBeenCalledWith('dark');
    expect(result).toMatchObject({ ok: true });
    expect(state.windows[0]?.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.themeChanged,
      expect.objectContaining({ effective: 'light' })
    );
  });

  it('rejects invalid theme sources', async () => {
    const handler = state.handlers.get(IPC_CHANNELS.themeSetSource);
    if (!handler) throw new Error('theme:setSource handler not registered');

    const result = await handler(null, 'neon');

    expect(result).toMatchObject({ ok: false });
    expect(saveThemeSource).not.toHaveBeenCalled();
  });
});
