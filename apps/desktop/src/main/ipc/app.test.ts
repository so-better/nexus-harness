/**
 * 应用 IPC：数据目录白名单与打开行为。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  openPath: vi.fn(async (_path: string) => ''),
  openExternal: vi.fn(async () => undefined),
  showItemInFolder: vi.fn()
}));

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/nexus',
    getName: () => 'Nexus',
    relaunch: vi.fn(),
    quit: vi.fn()
  },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      state.handlers.set(channel, handler);
    }
  },
  shell: {
    openPath: state.openPath,
    openExternal: state.openExternal,
    showItemInFolder: state.showItemInFolder
  }
}));

vi.mock('../services/storage/paths', () => ({
  getAppDataPaths: () => ({
    root: '/tmp/nexus',
    plugins: '/tmp/nexus/plugins',
    skills: '/tmp/nexus/skills',
    mcp: '/tmp/nexus/mcp'
  })
}));

vi.mock('../services/notifications/notification-service', () => ({
  consumePendingSession: () => null
}));

import { IPC_CHANNELS } from '@shared/ipc/channels';
import { registerAppIpc } from './app';

describe('app IPC', () => {
  beforeEach(() => {
    state.handlers.clear();
    state.openPath.mockClear();
    registerAppIpc();
  });

  it('opens only whitelisted data locations', async () => {
    const handler = state.handlers.get(IPC_CHANNELS.appOpenDataLocation);
    if (!handler) throw new Error('data location handler not registered');

    for (const target of ['plugins', 'skills', 'mcp']) {
      const result = (await handler({}, target)) as { ok: boolean };
      expect(result.ok).toBe(true);
    }
    expect(state.openPath.mock.calls.map(([path]) => path)).toEqual([
      '/tmp/nexus/plugins',
      '/tmp/nexus/skills',
      '/tmp/nexus/mcp'
    ]);

    const invalid = (await handler({}, '/etc')) as { ok: boolean };
    expect(invalid.ok).toBe(false);
    expect(state.openPath).toHaveBeenCalledTimes(3);
  });
});
