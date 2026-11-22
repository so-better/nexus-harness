/**
 * 会话、事件与 Run 存储测试：投影、事件顺序与级联删除。
 */

import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { createNexusEvent } from '@nexus/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../storage/database';
import { EventStore } from './event-store';
import { RunStore } from './run-store';
import { SessionService } from './session-service';

describe('session storage', () => {
  let directory = '';
  let db: DatabaseSync;
  let sessions: SessionService;
  let events: EventStore;
  let runs: RunStore;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nexus-session-'));
    db = createDatabase(join(directory, 'nexus.db'));
    events = new EventStore(db);
    sessions = new SessionService(db, events);
    runs = new RunStore(db);
  });

  afterEach(async () => {
    db.close();
    await rm(directory, { recursive: true, force: true });
  });

  it('creates, renames, lists and removes sessions', () => {
    const session = sessions.create({ title: '测试会话' });

    expect(sessions.list()).toHaveLength(1);
    expect(sessions.rename({ id: session.id, title: '新标题' })).toMatchObject({
      title: '新标题',
      titleSource: 'user'
    });

    sessions.remove(session.id);
    expect(sessions.get(session.id)).toBeUndefined();
    expect(sessions.list()).toEqual([]);
  });

  it('writes session lifecycle events', () => {
    const session = sessions.create({ title: '事件会话' });
    sessions.rename({ id: session.id, title: '重命名' });
    sessions.setPinned(session.id, true);

    const types = events.list(session.id).map((event) => event.type);
    expect(types).toEqual(['session.created', 'session.renamed', 'session.pinned']);
    expect(sessions.get(session.id)?.pinned).toBe(true);
  });

  it('persists Agent mode changes and emits an event', () => {
    const session = sessions.create();
    const updated = sessions.setMode({ id: session.id, mode: 'plan' });

    expect(updated.mode).toBe('plan');
    expect(events.list(session.id).some((event) => event.type === 'session.mode.changed')).toBe(
      true
    );
  });

  it('defaults to ask and persists approval policy changes', () => {
    const session = sessions.create();
    expect(session.approvalPolicy).toBe('ask');

    const updated = sessions.setApprovalPolicy({
      id: session.id,
      approvalPolicy: 'workspace'
    });
    expect(updated.approvalPolicy).toBe('workspace');
    expect(
      events.list(session.id).some((event) => event.type === 'session.approvalPolicy.changed')
    ).toBe(true);
  });

  it('sets auto titles only before a user title exists', () => {
    const session = sessions.create();
    expect(sessions.setAutoTitle(session.id, '自动标题')?.title).toBe('自动标题');
    expect(sessions.setAutoTitle(session.id, '再次覆盖')).toBeUndefined();

    const renamed = sessions.rename({ id: session.id, title: '用户标题' });
    expect(renamed.titleSource).toBe('user');
    expect(sessions.setAutoTitle(session.id, '不能覆盖')).toBeUndefined();
  });

  it('persists and revokes session roots', async () => {
    const session = sessions.create();
    const root = await mkdtemp(join(directory, 'root-'));
    const added = await sessions.addRoots(session.id, [root, root]);

    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      path: await realpath(root),
      kind: 'directory',
      access: 'write'
    });
    expect(events.list(session.id).filter((event) => event.type === 'scope.granted')).toHaveLength(
      1
    );

    expect(sessions.removeRoot(session.id, added[0]!.id)).toEqual([]);
    expect(events.list(session.id).some((event) => event.type === 'scope.revoked')).toBe(true);
  });

  it('replaces the session workspace instead of adding a second root', async () => {
    const session = sessions.create();
    const first = await mkdtemp(join(directory, 'first-'));
    const second = await mkdtemp(join(directory, 'second-'));
    await sessions.addRoots(session.id, [first]);
    const replaced = await sessions.addRoots(session.id, [second]);

    expect(replaced).toHaveLength(1);
    expect(replaced[0]?.path).toBe(await realpath(second));
    expect(events.list(session.id).filter((event) => event.type === 'scope.revoked')).toHaveLength(
      1
    );
  });

  it('rejects sensitive roots and filesystem roots', async () => {
    const session = sessions.create();
    const sensitive = join(directory, '.ssh');
    await mkdir(sensitive, { recursive: true });

    await expect(sessions.addRoots(session.id, ['/'])).rejects.toThrow();
    await expect(sessions.addRoots(session.id, [sensitive])).rejects.toThrow();
  });

  it('rejects oversized event payloads', () => {
    const session = sessions.create();

    expect(() =>
      events.append(
        createNexusEvent({
          sessionId: session.id,
          seq: 1,
          type: 'tool.completed',
          payload: { toolCallId: 'call-1', ok: true, output: 'x'.repeat(1_000_001) }
        })
      )
    ).toThrow('EVENT_PAYLOAD_TOO_LARGE');
  });

  it('assigns session-scoped sequence numbers and replays in order', () => {
    const session = sessions.create();
    const first = createNexusEvent({
      sessionId: session.id,
      seq: 99,
      type: 'run.started',
      payload: { model: 'mock-model' }
    });
    const second = createNexusEvent({
      sessionId: session.id,
      seq: 99,
      type: 'run.completed',
      payload: { durationMs: 10 }
    });

    expect(events.append(first).seq).toBe(2);
    expect(events.append(second).seq).toBe(3);
    expect(events.list(session.id).map((event) => event.seq)).toEqual([1, 2, 3]);
  });

  it('keeps events for audit when a session is removed', () => {
    const session = sessions.create();
    sessions.remove(session.id);

    expect(sessions.get(session.id)).toBeUndefined();
    expect(events.list(session.id).some((event) => event.type === 'session.removed')).toBe(true);
  });

  it('clears all sessions while keeping audit events', () => {
    const first = sessions.create({ title: '第一个' });
    const second = sessions.create({ title: '第二个' });

    expect(sessions.removeAll()).toEqual({ removed: 2 });
    expect(sessions.list()).toEqual([]);
    expect(events.list(first.id).some((event) => event.type === 'session.removed')).toBe(true);
    expect(events.list(second.id).some((event) => event.type === 'session.removed')).toBe(true);
    expect(sessions.removeAll()).toEqual({ removed: 0 });
  });

  it('marks unfinished runs as interrupted', () => {
    const session = sessions.create();
    runs.create('run-1', session.id);

    const interrupted = runs.markInterrupted();

    expect(interrupted).toHaveLength(1);
    expect(interrupted[0]).toMatchObject({ id: 'run-1', session_id: session.id });
    expect(runs.markInterrupted()).toEqual([]);
  });
});
