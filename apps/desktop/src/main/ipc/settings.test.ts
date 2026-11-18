/**
 * 设置 IPC 测试：开机自启、运行中缓存保护、artifact 索引清理。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  activeRuns: false,
  applyResult: true,
  clearCache: vi.fn(),
  saveAutoLaunch: vi.fn(),
  deleteArtifacts: vi.fn(),
  clearHttpCache: vi.fn()
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      state.handlers.set(channel, handler);
    }
  },
  session: {
    defaultSession: {
      clearCache: state.clearHttpCache
    }
  }
}));

vi.mock('../services/settings/startup-settings', () => ({
  loadAutoLaunch: vi.fn(async () => true),
  saveAutoLaunch: state.saveAutoLaunch,
  applyAutoLaunch: vi.fn(() => state.applyResult)
}));

vi.mock('../services/cache/cache-service', () => ({
  getCacheInfo: vi.fn(async () => ({
    filesBytes: 0,
    artifactsBytes: 0,
    logsBytes: 0,
    totalBytes: 0,
    failed: []
  })),
  clearCache: state.clearCache
}));

vi.mock('../services/agent/run-registry', () => ({
  hasActiveRuns: () => state.activeRuns
}));

vi.mock('../services/storage/paths', () => ({
  getAppDataPaths: () => ({
    files: '/tmp/files',
    artifacts: '/tmp/artifacts',
    logs: '/tmp/logs'
  })
}));

vi.mock('../services/storage/database', () => ({
  getDatabase: () => ({
    prepare: () => ({ run: state.deleteArtifacts })
  })
}));

import { IPC_CHANNELS } from '@shared/ipc/channels';
import { registerSettingsIpc } from './settings';

describe('settings IPC', () => {
  beforeEach(() => {
    state.handlers.clear();
    state.activeRuns = false;
    state.applyResult = true;
    state.clearCache.mockReset();
    state.saveAutoLaunch.mockReset();
    state.deleteArtifacts.mockReset();
    state.clearHttpCache.mockReset();
    registerSettingsIpc();
  });

  it('rejects an invalid auto-launch value', async () => {
    const handler = state.handlers.get(IPC_CHANNELS.settingsSetAutoLaunch);
    if (!handler) throw new Error('auto-launch handler not registered');

    const result = (await handler({}, 'yes')) as { ok: boolean };
    expect(result.ok).toBe(false);
    expect(state.saveAutoLaunch).not.toHaveBeenCalled();
  });

  it('persists the applied auto-launch state', async () => {
    const handler = state.handlers.get(IPC_CHANNELS.settingsSetAutoLaunch);
    if (!handler) throw new Error('auto-launch handler not registered');

    const result = (await handler({}, true)) as { ok: boolean; data: boolean };
    expect(result.ok).toBe(true);
    expect(result.data).toBe(true);
    expect(state.saveAutoLaunch).toHaveBeenCalledWith(true);
  });

  it('refuses cache clearing while a run is active', async () => {
    state.activeRuns = true;
    const handler = state.handlers.get(IPC_CHANNELS.cacheClear);
    if (!handler) throw new Error('cache clear handler not registered');

    const result = (await handler({}, 'all')) as { ok: boolean; error?: { code: string } };
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('CACHE_BUSY');
    expect(state.clearCache).not.toHaveBeenCalled();
  });

  it('clears artifact index and HTTP cache when all cache is cleared', async () => {
    state.clearCache.mockResolvedValue({
      filesBytes: 0,
      artifactsBytes: 0,
      logsBytes: 0,
      totalBytes: 0,
      failed: []
    });
    const handler = state.handlers.get(IPC_CHANNELS.cacheClear);
    if (!handler) throw new Error('cache clear handler not registered');

    const result = (await handler({}, 'all')) as { ok: boolean };
    expect(result.ok).toBe(true);
    expect(state.deleteArtifacts).toHaveBeenCalledTimes(1);
    expect(state.clearHttpCache).toHaveBeenCalledTimes(1);
  });
});
