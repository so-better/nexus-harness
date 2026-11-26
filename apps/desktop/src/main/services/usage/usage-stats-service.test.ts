/**
 * 用量统计：按天、会话与 Run 聚合事件流中的 usage.recorded。
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../storage/database';
import { getUsageStats, getSessionContextSnapshot } from './usage-stats-service';

const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 0, 1, 12);

describe('getUsageStats', () => {
  let directory = '';
  let db: ReturnType<typeof createDatabase>;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nexus-usage-stats-'));
    db = createDatabase(join(directory, 'nexus.db'));
    db.prepare(
      'INSERT INTO sessions (id, title, created_at, updated_at, last_active_at) VALUES (?, ?, ?, ?, ?)'
    ).run('session-1', 'Session one', START, START, START);
    db.prepare(
      'INSERT INTO sessions (id, title, created_at, updated_at, last_active_at) VALUES (?, ?, ?, ?, ?)'
    ).run('session-2', 'Session two', START + DAY, START + DAY, START + DAY);

    const insert = db.prepare(
      'INSERT INTO events (id, session_id, run_id, seq, type, version, ts, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    insert.run(
      'event-1',
      'session-1',
      'run-1',
      1,
      'usage.recorded',
      1,
      START,
      JSON.stringify({
        provider: 'openai',
        model: 'model-a',
        inputTokens: 100,
        outputTokens: 20,
        cacheReadTokens: 30,
        cacheWriteTokens: 10,
        cost: 0.01
      })
    );
    insert.run(
      'event-2',
      'session-1',
      'run-1',
      2,
      'usage.recorded',
      1,
      START + 1000,
      JSON.stringify({
        provider: 'openai',
        model: 'model-a',
        inputTokens: 50,
        outputTokens: 10,
        cost: 0.02
      })
    );
    insert.run(
      'event-3',
      'session-2',
      'run-2',
      1,
      'usage.recorded',
      1,
      START + DAY,
      JSON.stringify({
        provider: 'anthropic',
        model: 'model-b',
        inputTokens: 200,
        outputTokens: 80,
        cost: 0.03
      })
    );
    db.prepare('UPDATE sessions SET deleted_at = ? WHERE id = ?').run(START + DAY, 'session-2');
    db.prepare(
      'INSERT INTO sessions (id, title, created_at, updated_at, last_active_at) VALUES (?, ?, ?, ?, ?)'
    ).run('deleted-session', 'Deleted session', START, START, START);
    db.prepare('UPDATE sessions SET deleted_at = ? WHERE id = ?').run(START, 'deleted-session');
    insert.run(
      'event-deleted',
      'deleted-session',
      'run-deleted',
      1,
      'usage.recorded',
      1,
      START,
      JSON.stringify({
        provider: 'openai',
        model: 'model-a',
        inputTokens: 999,
        outputTokens: 999,
        cost: 0
      })
    );
  });

  afterEach(async () => {
    db.close();
    await rm(directory, { recursive: true, force: true });
  });

  it('aggregates totals, daily series, sessions, models and providers', () => {
    const result = getUsageStats(db);

    expect(result.totals).toMatchObject({
      inputTokens: 150,
      outputTokens: 30,
      totalTokens: 180,
      cost: 0.03,
      calls: 2
    });
    expect(result.series).toHaveLength(1);
    expect(result.series[0]?.key).toBe(String(START - (START % DAY)));
    expect(result.sessions[0]?.title).toBe('Session one');
    expect(result.models.map((item) => item.key)).toEqual(['model-a']);
    expect(result.providers.map((item) => item.key)).toEqual(['openai']);
  });

  it('filters by session and groups by run', () => {
    const result = getUsageStats(db, { sessionId: 'session-1', bucket: 'run' });

    expect(result.totals.totalTokens).toBe(180);
    expect(result.totals.cacheReadTokens).toBe(30);
    expect(result.totals.cacheWriteTokens).toBe(10);
    expect(result.series).toHaveLength(1);
    expect(result.series[0]?.key).toBe('run-1');
    expect(result.series[0]?.calls).toBe(2);
  });

  it('applies the time range before day bucketing', () => {
    const result = getUsageStats(db, { from: START + DAY - 1, bucket: 'day' });

    expect(result.totals.totalTokens).toBe(0);
    expect(result.series).toHaveLength(0);
  });
});

describe('getSessionContextSnapshot', () => {
  let directory = '';
  let db: ReturnType<typeof createDatabase>;

  /**
   * 插入一条 usage.recorded；messageId 缺失表示辅助调用，parentToolCallId 非空表示子代理。
   */
  const insertUsage = (input: {
    id: string;
    seq: number;
    inputTokens: number;
    messageId?: string;
    parentToolCallId?: string;
    breakdown?: { systemTokens: number; toolsTokens: number; historyTokens: number };
  }): void => {
    db.prepare(
      `INSERT INTO events (id, session_id, run_id, seq, type, version, ts, payload, parent_tool_call_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.id,
      'session-ctx',
      'run-1',
      input.seq,
      'usage.recorded',
      1,
      START + input.seq,
      JSON.stringify({
        provider: 'openai',
        model: 'model-a',
        inputTokens: input.inputTokens,
        outputTokens: 1,
        ...(input.messageId ? { messageId: input.messageId } : {}),
        ...(input.breakdown ?? {})
      }),
      input.parentToolCallId ?? null
    );
  };

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nexus-usage-context-'));
    db = createDatabase(join(directory, 'nexus.db'));
    db.prepare(
      'INSERT INTO sessions (id, title, created_at, updated_at, last_active_at) VALUES (?, ?, ?, ?, ?)'
    ).run('session-ctx', 'Context', START, START, START);
  });

  afterEach(async () => {
    db.close();
    await rm(directory, { recursive: true, force: true });
  });

  it('returns the latest main-conversation input tokens', () => {
    insertUsage({ id: 'e1', seq: 1, inputTokens: 100, messageId: 'msg-1' });
    insertUsage({ id: 'e2', seq: 2, inputTokens: 250, messageId: 'msg-2' });

    expect(getSessionContextSnapshot(db, 'session-ctx').contextTokens).toBe(250);
  });

  it('ignores subagent events and auxiliary calls without a messageId', () => {
    insertUsage({ id: 'e1', seq: 1, inputTokens: 100, messageId: 'msg-1' });
    // 子代理事件：parent_tool_call_id 非空
    insertUsage({
      id: 'e2',
      seq: 2,
      inputTokens: 900,
      messageId: 'sub-1',
      parentToolCallId: 'tool-1'
    });
    // 辅助调用：无 messageId
    insertUsage({ id: 'e3', seq: 3, inputTokens: 777 });

    expect(getSessionContextSnapshot(db, 'session-ctx').contextTokens).toBe(100);
  });

  it('returns 0 when there is no main-conversation usage', () => {
    insertUsage({ id: 'e1', seq: 1, inputTokens: 500 });

    expect(getSessionContextSnapshot(db, 'session-ctx').contextTokens).toBe(0);
  });

  it('returns the context breakdown when present', () => {
    insertUsage({
      id: 'e1',
      seq: 1,
      inputTokens: 1000,
      messageId: 'msg-1',
      breakdown: { systemTokens: 100, toolsTokens: 700, historyTokens: 200 }
    });

    expect(getSessionContextSnapshot(db, 'session-ctx')).toEqual({
      contextTokens: 1000,
      systemTokens: 100,
      toolsTokens: 700,
      historyTokens: 200
    });
  });
});
