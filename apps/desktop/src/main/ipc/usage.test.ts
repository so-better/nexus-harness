/**
 * 用量 IPC：参数校验、统计结果包装与会话上下文快照。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  stats: vi.fn(),
  contextTokens: vi.fn((): Record<string, number> => ({ contextTokens: 0 })),
  getSession: vi.fn((): unknown => undefined),
  listProviders: vi.fn(async (): Promise<unknown[]> => [])
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
  getUsageStats: state.stats,
  getSessionContextSnapshot: state.contextTokens
}));

vi.mock('../services/session/event-store', () => ({
  EventStore: class {}
}));

vi.mock('../services/session/create-session-service', () => ({
  createSessionService: () => ({ get: state.getSession })
}));

vi.mock('../services/provider/provider-store', () => ({
  providerStore: { list: state.listProviders }
}));

import { IPC_CHANNELS } from '@shared/ipc/channels';
import { registerUsageIpc } from './usage';

const handler = (): ((...args: unknown[]) => Promise<unknown>) => {
  const registered = state.handlers.get(IPC_CHANNELS.usageStats);
  if (!registered) throw new Error('usage:stats handler not registered');
  return registered as (...args: unknown[]) => Promise<unknown>;
};

const emptyStats = () => ({
  totals: {},
  series: [],
  sessions: [],
  models: [],
  providers: []
});

describe('usage IPC', () => {
  beforeEach(() => {
    state.handlers.clear();
    state.stats.mockReset();
    state.contextTokens.mockReset();
    state.contextTokens.mockReturnValue({ contextTokens: 0 });
    state.getSession.mockReset();
    state.getSession.mockReturnValue(undefined);
    state.listProviders.mockReset();
    state.listProviders.mockResolvedValue([]);
    registerUsageIpc();
  });

  it('passes a validated query to the stats service', async () => {
    state.stats.mockReturnValue(emptyStats());
    const result = (await handler()({}, { sessionId: 'session-1', bucket: 'run' })) as {
      ok: boolean;
      data: unknown;
    };

    expect(result.ok).toBe(true);
    expect(state.stats).toHaveBeenCalledWith({}, { sessionId: 'session-1', bucket: 'run' });
  });

  it('rejects invalid query input', async () => {
    const result = (await handler()({}, { bucket: 'week' })) as {
      ok: boolean;
      error?: { code: string };
    };

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('USAGE_INVALID_INPUT');
    expect(state.stats).not.toHaveBeenCalled();
  });

  it('attaches a context snapshot when the session model resolves', async () => {
    state.stats.mockReturnValue(emptyStats());
    state.getSession.mockReturnValue({ providerId: 'provider-1', modelId: 'model-1' });
    state.listProviders.mockResolvedValue([
      {
        id: 'provider-1',
        models: [{ id: 'model-1', contextWindow: 128_000, maxOutputTokens: 8_192 }]
      }
    ]);
    state.contextTokens.mockReturnValue({
      contextTokens: 42,
      systemTokens: 5,
      toolsTokens: 30,
      historyTokens: 7
    });

    const result = (await handler()({}, { sessionId: 'session-1' })) as {
      ok: boolean;
      data: {
        context?: {
          contextTokens: number;
          contextWindow: number;
          breakdown?: { systemTokens: number; toolsTokens: number; historyTokens: number };
        };
      };
    };

    expect(result.ok).toBe(true);
    expect(result.data.context).toMatchObject({
      contextTokens: 42,
      contextWindow: 128_000,
      breakdown: { systemTokens: 5, toolsTokens: 30, historyTokens: 7 }
    });
  });

  it('still returns stats when context resolution fails', async () => {
    state.stats.mockReturnValue(emptyStats());
    state.getSession.mockReturnValue({ providerId: 'provider-1', modelId: 'model-1' });
    state.listProviders.mockRejectedValue(new Error('boom'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = (await handler()({}, { sessionId: 'session-1' })) as {
      ok: boolean;
      data: { context?: unknown };
    };
    warn.mockRestore();

    expect(result.ok).toBe(true);
    expect(result.data.context).toBeUndefined();
  });
});
