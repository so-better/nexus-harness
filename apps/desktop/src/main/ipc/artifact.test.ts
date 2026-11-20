/**
 * Artifact IPC 测试：参数校验与读取结果。
 */

import { IPC_CHANNELS } from '@shared/ipc/channels';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>()
}));

const read = vi.hoisted(() => vi.fn());
const meta = vi.hoisted(() => vi.fn());
const showSaveDialog = vi.hoisted(() => vi.fn());
const writeFile = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  dialog: { showSaveDialog },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      state.handlers.set(channel, handler);
    }
  }
}));

vi.mock('node:fs/promises', () => ({ writeFile }));

vi.mock('../services/artifacts/artifact-service', () => ({
  ArtifactService: class {
    read = read;
    meta = meta;
  }
}));

vi.mock('../services/storage/database', () => ({ getDatabase: () => ({}) }));

import { registerArtifactIpc } from './artifact';

describe('artifact IPC', () => {
  beforeEach(() => {
    state.handlers.clear();
    read.mockReset();
    meta.mockReset();
    showSaveDialog.mockReset();
    writeFile.mockReset();
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

  it('reads artifact metadata without loading content', async () => {
    meta.mockResolvedValue({ artifactId: 'artifact-1', label: 'tool-output', bytes: 5 });
    const handler = state.handlers.get(IPC_CHANNELS.artifactMeta);
    if (!handler) throw new Error('artifact:meta handler not registered');

    const result = (await handler({}, { sessionId: 'session-1', artifactId: 'artifact-1' })) as {
      ok: boolean;
      data: { label: string; bytes: number };
    };

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ label: 'tool-output', bytes: 5 });
    expect(read).not.toHaveBeenCalled();
  });

  it('saves an artifact to the user-selected path', async () => {
    meta.mockResolvedValue({ artifactId: 'artifact-1', label: 'tool-output', bytes: 5 });
    read.mockResolvedValue({
      artifactId: 'artifact-1',
      label: 'tool-output',
      bytes: 5,
      content: 'hello'
    });
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/out.txt' });
    writeFile.mockResolvedValue(undefined);
    const handler = state.handlers.get(IPC_CHANNELS.artifactSaveAs);
    if (!handler) throw new Error('artifact:saveAs handler not registered');

    const result = (await handler({}, { sessionId: 'session-1', artifactId: 'artifact-1' })) as {
      ok: boolean;
      data: { saved: boolean; path?: string };
    };

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ saved: true, path: '/tmp/out.txt' });
    expect(writeFile).toHaveBeenCalledWith('/tmp/out.txt', 'hello', 'utf8');
  });

  it('does not read or write when the save dialog is cancelled', async () => {
    meta.mockResolvedValue({ artifactId: 'artifact-1', label: 'tool-output', bytes: 5 });
    showSaveDialog.mockResolvedValue({ canceled: true });
    const handler = state.handlers.get(IPC_CHANNELS.artifactSaveAs);
    if (!handler) throw new Error('artifact:saveAs handler not registered');

    const result = (await handler({}, { sessionId: 'session-1', artifactId: 'artifact-1' })) as {
      ok: boolean;
      data: { saved: boolean };
    };

    expect(result.ok).toBe(true);
    expect(result.data.saved).toBe(false);
    expect(read).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('rejects invalid input', async () => {
    const handler = state.handlers.get(IPC_CHANNELS.artifactRead);
    if (!handler) throw new Error('artifact:read handler not registered');

    const result = (await handler({}, { sessionId: '', artifactId: '' })) as { ok: boolean };
    expect(result.ok).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });
});
