/**
 * 检查点 IPC 测试：参数校验与恢复调用。
 */

import { IPC_CHANNELS } from '@shared/ipc/channels';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>()
}));

const restore = vi.hoisted(() => vi.fn(async () => 2));
const append = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      state.handlers.set(channel, handler);
    }
  }
}));

vi.mock('../services/checkpoint/checkpoint-service', () => ({
  CheckpointService: class {
    restore = restore;
  }
}));

vi.mock('../services/session/event-store', () => ({
  EventStore: class {
    append = append;
  }
}));

vi.mock('../services/storage/database', () => ({ getDatabase: () => ({}) }));

import { registerCheckpointIpc } from './checkpoint';

describe('checkpoint IPC', () => {
  beforeEach(() => {
    state.handlers.clear();
    restore.mockClear();
    append.mockClear();
    registerCheckpointIpc();
  });

  it('restores a checkpoint', async () => {
    const handler = state.handlers.get(IPC_CHANNELS.checkpointRestore);
    if (!handler) throw new Error('checkpoint:restore handler not registered');

    const result = (await handler(
      {},
      { sessionId: 'session-1', checkpointId: 'checkpoint-1' }
    )) as { ok: boolean; data: { restored: number } };

    expect(result.ok).toBe(true);
    expect(result.data.restored).toBe(2);
    expect(restore).toHaveBeenCalledWith('session-1', 'checkpoint-1');
    expect(append).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid input', async () => {
    const handler = state.handlers.get(IPC_CHANNELS.checkpointRestore);
    if (!handler) throw new Error('checkpoint:restore handler not registered');

    const result = (await handler({}, { sessionId: '', checkpointId: '' })) as { ok: boolean };
    expect(result.ok).toBe(false);
    expect(restore).not.toHaveBeenCalled();
  });
});
