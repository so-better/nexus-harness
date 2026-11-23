/**
 * 记忆 IPC：CRUD 与跨窗口变更广播。
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '../services/storage/database';

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  db: null as ReturnType<typeof createDatabase> | null,
  windows: [
    { isDestroyed: () => false, webContents: { send: vi.fn() } },
    { isDestroyed: () => true, webContents: { send: vi.fn() } }
  ]
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      state.handlers.set(channel, handler);
    }
  },
  BrowserWindow: { getAllWindows: () => state.windows }
}));

vi.mock('../services/storage/database', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, getDatabase: () => state.db };
});

import { IPC_CHANNELS } from '@shared/ipc/channels';
import { registerMemoryIpc } from './memory';

describe('memory IPC', () => {
  let directory = '';

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nexus-memory-ipc-'));
    state.db = createDatabase(join(directory, 'nexus.db'));
    state.handlers.clear();
    state.windows[0]?.webContents.send.mockClear();
    state.windows[1]?.webContents.send.mockClear();
    registerMemoryIpc();
  });

  afterEach(async () => {
    state.db?.close();
    await rm(directory, { recursive: true, force: true });
  });

  it('creates, updates and deletes memories and broadcasts changes', async () => {
    const create = state.handlers.get(IPC_CHANNELS.memoryCreate);
    const update = state.handlers.get(IPC_CHANNELS.memoryUpdate);
    const remove = state.handlers.get(IPC_CHANNELS.memoryDelete);
    if (!create || !update || !remove) throw new Error('memory handlers not registered');

    const created = (await create(
      {},
      {
        title: '回答风格',
        content: '偏好简洁中文回答。',
        kind: 'preference'
      }
    )) as { ok: boolean; data: { id: string } };
    expect(created.ok).toBe(true);
    expect(state.windows[0]?.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.memoryChanged);
    expect(state.windows[1]?.webContents.send).not.toHaveBeenCalled();

    const updated = (await update(
      {},
      {
        id: created.data.id,
        content: '偏好简洁回答。'
      }
    )) as { ok: boolean };
    expect(updated.ok).toBe(true);

    const removed = (await remove({}, { id: created.data.id })) as {
      ok: boolean;
      data: { removed: boolean };
    };
    expect(removed.ok).toBe(true);
    expect(removed.data.removed).toBe(true);
  });

  it('persists memory switches', async () => {
    const setSettings = state.handlers.get(IPC_CHANNELS.memorySetSettings);
    if (!setSettings) throw new Error('memory settings handler not registered');
    const result = (await setSettings({}, { autoCapture: false, retrieval: true })) as {
      ok: boolean;
      data: { autoCapture: boolean };
    };
    expect(result.ok).toBe(true);
    expect(result.data.autoCapture).toBe(false);
  });
});
