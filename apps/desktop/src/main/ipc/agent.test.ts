/**
 * Agent IPC 集成测试：启动、事件推送与取消。
 */

import { IPC_CHANNELS } from '@shared/ipc/channels';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  sent: [] as Array<{ channel: string; payload: unknown }>,
  events: [] as Array<Record<string, unknown>>,
  mode: 'complete' as 'complete' | 'wait'
}));

vi.mock('electron', () => ({
  app: { isPackaged: false },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      state.handlers.set(channel, handler);
    }
  }
}));

vi.mock('../services/provider/provider-store', () => ({
  providerStore: {
    get: vi.fn(async () => ({
      id: 'provider-1',
      name: 'Mock',
      baseUrl: 'https://example.com/v1',
      models: [{ id: 'mock-model', contextWindow: 128_000, maxOutputTokens: 4_096 }],
      defaultModelId: 'mock-model',
      apiKey: 'secret',
      enabled: true
    }))
  }
}));

vi.mock('../services/storage/database', () => ({ getDatabase: () => ({}) }));

vi.mock('../services/session/session-service', () => ({
  SessionService: class {
    get() {
      return { id: 'session-1' };
    }
    listRoots() {
      return [];
    }
    setStatus() {}
  }
}));

vi.mock('../services/session/event-store', () => ({
  EventStore: class {
    list() {
      return state.events;
    }
    append(event: Record<string, unknown>) {
      const stored = { ...event, seq: state.events.length + 1 };
      state.events.push(stored);
      return stored;
    }
  }
}));

vi.mock('../services/session/run-store', () => ({
  RunStore: class {
    create() {}
    updateStatus() {}
  }
}));

vi.mock('../services/agent/agent-service', () => ({
  AgentService: class {
    async run(
      _input: unknown,
      _provider: unknown,
      hooks: { onEvent: (event: Record<string, unknown>) => void; signal: AbortSignal }
    ) {
      hooks.onEvent({
        id: 'event-1',
        sessionId: 'session-1',
        runId: 'run',
        seq: 1,
        type: 'run.started',
        version: 1,
        ts: 1,
        payload: { model: 'mock-model' }
      });

      if (state.mode === 'wait') {
        await new Promise<void>((resolve) => {
          hooks.signal.addEventListener('abort', () => resolve());
        });
        hooks.onEvent({
          id: 'event-2',
          sessionId: 'session-1',
          runId: 'run',
          seq: 2,
          type: 'run.cancelled',
          version: 1,
          ts: 2,
          payload: { reason: 'aborted' }
        });
      } else {
        hooks.onEvent({
          id: 'event-2',
          sessionId: 'session-1',
          runId: 'run',
          seq: 2,
          type: 'run.completed',
          version: 1,
          ts: 2,
          payload: { durationMs: 1 }
        });
      }

      return {
        runId: 'run',
        sessionId: 'session-1',
        steps: 1,
        toolCalls: 0,
        finishReason: 'stop',
        messages: []
      };
    }
  }
}));

import { approvalService } from '../services/agent/approval-service';
import { askUserService } from '../services/agent/ask-user-service';
import { workspaceAuthService } from '../services/agent/workspace-auth-service';
import { registerAgentIpc } from './agent';

const input = {
  sessionId: 'session-1',
  prompt: 'hello',
  rootPaths: ['/tmp'],
  providerId: 'provider-1',
  modelId: 'mock-model'
};

const createSender = (id = 1) => ({
  id,
  isDestroyed: () => false,
  send: (channel: string, payload: unknown) => state.sent.push({ channel, payload }),
  once: vi.fn(),
  removeListener: vi.fn()
});

describe('agent IPC', () => {
  beforeEach(() => {
    state.handlers.clear();
    state.sent = [];
    state.events = [];
    state.mode = 'complete';
    registerAgentIpc();
  });

  it('starts a run and forwards persisted events', async () => {
    const sender = createSender();
    const handler = state.handlers.get(IPC_CHANNELS.agentRun);
    if (!handler) throw new Error('agent:run handler not registered');

    const result = (await handler({ sender }, input)) as { ok: boolean; data: { runId: string } };
    expect(result.ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(state.sent.map((item) => item.channel)).toEqual([
      IPC_CHANNELS.agentEvent,
      IPC_CHANNELS.agentEvent
    ]);
    expect((state.sent[1]?.payload as { type?: string }).type).toBe('run.completed');
  });

  it('supersedes the whole branch after the source user when regenerating', async () => {
    state.events = [
      {
        id: 'event-user',
        sessionId: 'session-1',
        seq: 1,
        type: 'message.completed',
        version: 1,
        ts: 1,
        payload: { messageId: 'user-1', role: 'user', content: 'hello' }
      },
      {
        id: 'event-aborted',
        sessionId: 'session-1',
        runId: 'old-run',
        seq: 2,
        type: 'message.reasoning.delta',
        version: 1,
        ts: 2,
        payload: { messageId: 'aborted-reasoning', text: 'old reasoning' }
      },
      {
        id: 'event-assistant',
        sessionId: 'session-1',
        runId: 'old-run',
        seq: 3,
        type: 'message.completed',
        version: 1,
        ts: 3,
        payload: { messageId: 'assistant-old', role: 'assistant', content: 'old answer' }
      }
    ];
    const sender = createSender();
    const handler = state.handlers.get(IPC_CHANNELS.agentRun);
    if (!handler) throw new Error('agent:run handler not registered');

    const result = (await handler(
      { sender },
      { ...input, prompt: 'retry', regenerateMessageId: 'assistant-old' }
    )) as { ok: boolean };
    expect(result.ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const superseded = state.sent
      .filter(
        (item) =>
          item.channel === IPC_CHANNELS.agentEvent &&
          (item.payload as { type?: string }).type === 'message.superseded'
      )
      .map((item) => (item.payload as { payload: { messageId: string } }).payload.messageId);
    expect(new Set(superseded)).toEqual(new Set(['aborted-reasoning', 'assistant-old']));
  });

  it('resolves approvals only for the owning window', async () => {
    const handler = state.handlers.get(IPC_CHANNELS.approvalResolve);
    if (!handler) throw new Error('approval:resolve handler not registered');

    const pending = approvalService.request('approval-test', 'run-x', 1);
    const wrong = (await handler(
      { sender: createSender(2) },
      { approvalId: 'approval-test', approved: true }
    )) as { data: { resolved: boolean } };
    expect(wrong.data.resolved).toBe(false);

    const right = (await handler(
      { sender: createSender(1) },
      { approvalId: 'approval-test', approved: true }
    )) as { data: { resolved: boolean } };
    expect(right.data.resolved).toBe(true);
    await expect(pending).resolves.toBe(true);
  });

  it('cancels a run by session and releases workspace authorization', async () => {
    state.mode = 'wait';
    const sender = createSender();
    const runHandler = state.handlers.get(IPC_CHANNELS.agentRun);
    const cancelSession = state.handlers.get(IPC_CHANNELS.agentCancelSession);
    if (!runHandler || !cancelSession) throw new Error('agent handlers not registered');

    const started = (await runHandler({ sender }, input)) as {
      ok: boolean;
      data: { runId: string };
    };
    const pendingAuth = workspaceAuthService.request(
      'workspace-auth-test',
      started.data.runId,
      sender.id,
      '/tmp'
    );
    const cancelled = (await cancelSession({ sender }, input.sessionId)) as {
      ok: boolean;
      data: { cancelled: boolean };
    };

    expect(cancelled.ok).toBe(true);
    expect(cancelled.data.cancelled).toBe(true);
    await expect(pendingAuth).resolves.toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('cancels a run owned by the same window', async () => {
    state.mode = 'wait';
    const sender = createSender();
    const runHandler = state.handlers.get(IPC_CHANNELS.agentRun);
    const cancelHandler = state.handlers.get(IPC_CHANNELS.agentCancel);
    if (!runHandler || !cancelHandler) throw new Error('agent handlers not registered');
    const cancelAskUser = vi.spyOn(askUserService, 'cancelRun');

    const started = (await runHandler({ sender }, input)) as {
      ok: boolean;
      data: { runId: string };
    };
    const cancelled = (await cancelHandler({ sender }, started.data.runId)) as {
      ok: boolean;
      data: { cancelled: boolean };
    };

    expect(cancelled.ok).toBe(true);
    expect(cancelled.data.cancelled).toBe(true);
    expect(cancelAskUser).toHaveBeenCalledWith(started.data.runId);
    cancelAskUser.mockRestore();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      state.sent.some((item) => (item.payload as { type?: string }).type === 'run.cancelled')
    ).toBe(true);
  });
});
