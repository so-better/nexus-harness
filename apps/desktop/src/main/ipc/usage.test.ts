/**
 * 用量 IPC：参数校验与统计结果包装。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  stats: vi.fn()
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      state.handlers.set(channel, handler);
    }
  }
}));

vi.mock('../services/storage/database', () => ({
  getDatabase: () => ({})
}));

vi.mock('../services/usage/usage-stats-service', () => ({
  getUsageStats: state.stats
}));

import { IPC_CHANNELS } from '@shared/ipc/channels';
import { registerUsageIpc } from './usage';

const handler = (): ((...args: unknown[]) => unknown) => {
  const registered = state.handlers.get(IPC_CHANNELS.usageStats);
  if (!registered) throw new Error('usage:stats handler not registered');
  return registered;
};

describe('usage IPC', () => {
  beforeEach(() => {
    state.handlers.clear();
    state.stats.mockReset();
    registerUsageIpc();
  });

  it('passes a validated query to the stats service', () => {
    state.stats.mockReturnValue({
      totals: {},
      series: [],
      sessions: [],
      models: [],
      providers: []
    });
    const result = handler()({}, { sessionId: 'session-1', bucket: 'run' }) as {
      ok: boolean;
      data: unknown;
    };

    expect(result.ok).toBe(true);
    expect(state.stats).toHaveBeenCalledWith({}, { sessionId: 'session-1', bucket: 'run' });
  });

  it('rejects invalid query input', () => {
    const result = handler()({}, { bucket: 'week' }) as { ok: boolean; error?: { code: string } };

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('USAGE_INVALID_INPUT');
    expect(state.stats).not.toHaveBeenCalled();
  });
});
