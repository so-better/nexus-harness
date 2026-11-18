/**
 * 事件存储：append-only 写入并按 session 回放。
 */

import type { DatabaseSync } from 'node:sqlite';
import type { NexusEvent, NexusEventType } from '@shared/events';

const MAX_EVENT_PAYLOAD_BYTES = 1_000_000;

interface EventRow {
  id: string;
  session_id: string;
  run_id: string | null;
  seq: number;
  type: string;
  version: number;
  ts: number;
  payload: string;
}

const toEvent = (row: EventRow): NexusEvent => {
  const payload: unknown = JSON.parse(row.payload);
  const base = {
    id: row.id,
    sessionId: row.session_id,
    seq: Number(row.seq),
    type: row.type as NexusEventType,
    version: Number(row.version),
    ts: Number(row.ts),
    payload
  };

  // 事件 payload 已由写入方生成，这里按事件类型恢复为联合类型
  const event = (row.run_id === null
    ? base
    : { ...base, runId: row.run_id }) as unknown as NexusEvent;
  return event;
};

export class EventStore {
  constructor(private readonly db: DatabaseSync) {}

  /**
   * 追加事件；seq 由 session 维度统一分配，覆盖调用方的 run 内序号。
   */
  append(event: NexusEvent): NexusEvent {
    const row = this.db
      .prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM events WHERE session_id = ?')
      .get(event.sessionId) as { seq: number } | undefined;
    const seq = Number(row?.seq ?? 1);
    const stored: NexusEvent = { ...event, seq };
    const payload = JSON.stringify(stored.payload);
    if (Buffer.byteLength(payload, 'utf8') > MAX_EVENT_PAYLOAD_BYTES) {
      throw new Error('EVENT_PAYLOAD_TOO_LARGE');
    }

    this.db
      .prepare(
        `INSERT INTO events (id, session_id, run_id, seq, type, version, ts, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        stored.id,
        stored.sessionId,
        stored.runId ?? null,
        stored.seq,
        stored.type,
        stored.version,
        stored.ts,
        payload
      );

    this.syncSearchIndex(stored);
    return stored;
  }

  /**
   * 同步消息搜索索引；索引失败不能影响事件写入。
   */
  private syncSearchIndex(event: NexusEvent): void {
    try {
      if (event.type === 'message.completed') {
        const payload = event.payload as { messageId?: unknown; role?: unknown; content?: unknown };
        if (
          typeof payload.messageId !== 'string' ||
          (payload.role !== 'user' && payload.role !== 'assistant') ||
          typeof payload.content !== 'string'
        ) {
          return;
        }
        this.db
          .prepare('DELETE FROM session_message_search WHERE message_id = ?')
          .run(payload.messageId);
        this.db
          .prepare(
            `INSERT INTO session_message_search (session_id, message_id, role, content, ts)
             VALUES (?, ?, ?, ?, ?)`
          )
          .run(event.sessionId, payload.messageId, payload.role, payload.content, event.ts);
      } else if (event.type === 'session.removed') {
        this.db
          .prepare('DELETE FROM session_message_search WHERE session_id = ?')
          .run(event.sessionId);
      }
    } catch (error) {
      console.error('搜索索引更新失败', error);
    }
  }

  /**
   * 按 seq 回放会话事件。
   */
  list(sessionId: string): NexusEvent[] {
    const rows = this.db
      .prepare('SELECT * FROM events WHERE session_id = ? ORDER BY seq ASC')
      .all(sessionId) as unknown as EventRow[];
    return rows.map(toEvent);
  }
}
