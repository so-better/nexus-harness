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
  loadStartupSelection: vi.fn(async () => null),
  applyStartupSelection: vi.fn(async (selection: unknown) => selection),
  deleteArtifacts: vi.fn(),
  deleteFiles: vi.fn(),
  clearHttpCache: vi.fn(),
  disposeMcp: vi.fn(async () => undefined),
  prewarmMcp: vi.fn(async () => undefined)
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

vi.mock('../services/settings/startup-animation-settings', () => ({
  loadStartupSelection: state.loadStartupSelection
}));

vi.mock('../services/settings/startup-animation-service', () => ({
  applyStartupSelection: state.applyStartupSelection
}));

vi.mock('../services/cache/cache-service', () => ({
  getCacheInfo: vi.fn(async () => ({
    filesBytes: 0,
    artifactsBytes: 0,
    logsBytes: 0,
    mcpBytes: 0,
    totalBytes: 0,
    failed: []
  })),
  clearCache: state.clearCache
}));

vi.mock('../services/mcp/mcp-service-instance', () => ({
  getMcpService: () => ({ dispose: state.disposeMcp, prewarm: state.prewarmMcp })
}));

vi.mock('../services/agent/run-registry', () => ({
  hasActiveRuns: () => state.activeRuns
}));

vi.mock('../services/storage/paths', () => ({
  getAppDataPaths: () => ({
    files: '/tmp/files',
    artifacts: '/tmp/artifacts',
    logs: '/tmp/logs',
    mcp: '/tmp/mcp'
  }),
  getMcpWorkdirPath: (mcp: string) => `${mcp}/workdir`
}));

vi.mock('../services/storage/database', () => ({
  getDatabase: () => ({
    prepare: (sql: string) => ({
      run: sql.includes('files') ? state.deleteFiles : state.deleteArtifacts
    })
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
    state.loadStartupSelection.mockClear();
    state.applyStartupSelection.mockClear();
    state.deleteArtifacts.mockReset();
    state.clearHttpCache.mockReset();
    state.disposeMcp.mockReset();
    state.prewarmMcp.mockReset();
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

  it('rejects an invalid startup animation selection', async () => {
    const handler = state.handlers.get(IPC_CHANNELS.settingsSetStartup);
    if (!handler) throw new Error('startup handler not registered');

    const result = (await handler({}, { pluginId: 'x' })) as { ok: boolean };
    expect(result.ok).toBe(false);
    expect(state.applyStartupSelection).not.toHaveBeenCalled();
  });

  it('persists a valid startup animation selection', async () => {
    const handler = state.handlers.get(IPC_CHANNELS.settingsSetStartup);
    if (!handler) throw new Error('startup handler not registered');
    const selection = { pluginId: 'nexus.startup-intro', startupId: 'fade' };

    const result = (await handler({}, selection)) as { ok: boolean; data: unknown };
    expect(result.ok).toBe(true);
    expect(result.data).toEqual(selection);
    expect(state.applyStartupSelection).toHaveBeenCalledWith(selection);
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
      mcpBytes: 0,
      totalBytes: 0,
      failed: []
    });
    const handler = state.handlers.get(IPC_CHANNELS.cacheClear);
    if (!handler) throw new Error('cache clear handler not registered');

    const result = (await handler({}, 'all')) as { ok: boolean };
    expect(result.ok).toBe(true);
    expect(state.deleteArtifacts).toHaveBeenCalledTimes(1);
    expect(state.deleteFiles).toHaveBeenCalledTimes(1);
    expect(state.disposeMcp).toHaveBeenCalledTimes(1);
    expect(state.prewarmMcp).toHaveBeenCalledTimes(1);
    expect(state.clearHttpCache).toHaveBeenCalledTimes(1);
  });
});
