/**
 * Artifact IPC 测试：参数校验与读取结果。
 */

import { IPC_CHANNELS } from '@shared/ipc/channels';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>()
}));

const read = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      state.handlers.set(channel, handler);
    }
  }
}));

vi.mock('../services/artifacts/artifact-service', () => ({
  ArtifactService: class {
    read = read;
  }
}));

vi.mock('../services/storage/database', () => ({ getDatabase: () => ({}) }));

import { registerArtifactIpc } from './artifact';

describe('artifact IPC', () => {
  beforeEach(() => {
    state.handlers.clear();
    read.mockReset();
    registerArtifactIpc();
  });

  it('reads an artifact by session and id', async () => {
    read.mockResolvedValue({
      artifactId: 'artifact-1',
      label: 'tool-output',
      bytes: 5,
      content: 'hello'
    });
    const handler = state.handlers.get(IPC_CHANNELS.artifactRead);
    if (!handler) throw new Error('artifact:read handler not registered');

    const result = (await handler({}, { sessionId: 'session-1', artifactId: 'artifact-1' })) as {
      ok: boolean;
      data: { content: string };
    };

    expect(result.ok).toBe(true);
    expect(result.data.content).toBe('hello');
    expect(read).toHaveBeenCalledWith('session-1', 'artifact-1');
  });

  it('returns not found when metadata is missing', async () => {
    read.mockResolvedValue(undefined);
    const handler = state.handlers.get(IPC_CHANNELS.artifactRead);
    if (!handler) throw new Error('artifact:read handler not registered');

    const result = (await handler({}, { sessionId: 'session-1', artifactId: 'missing' })) as {
      ok: boolean;
      error?: { code: string };
    };

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('ARTIFACT_NOT_FOUND');
  });

  it('rejects invalid input', async () => {
    const handler = state.handlers.get(IPC_CHANNELS.artifactRead);
    if (!handler) throw new Error('artifact:read handler not registered');

    const result = (await handler({}, { sessionId: '', artifactId: '' })) as { ok: boolean };
    expect(result.ok).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });
});
