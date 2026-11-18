/**
 * 跨会话搜索：匹配会话标题与 message.completed 内容。
 */

import type { DatabaseSync } from 'node:sqlite';
import type { SessionSearchResult } from '@shared/ipc/contracts';

interface TitleRow {
  id: string;
  title: string;
  last_active_at: number;
}

interface MessageRow {
  sessionId: string;
  title: string;
  ts: number;
  payload: string;
}

interface MessagePayload {
  content?: unknown;
}

const escapeLike = (value: string): string => value.replace(/[\\%_]/g, '\\$&');

/**
 * 从消息正文截取查询附近片段，并压平换行。
 */
const toSnippet = (content: string, query: string): string => {
  const normalized = content.replace(/\s+/g, ' ').trim();
  const index = normalized.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if (index < 0) return normalized.slice(0, 96);
  const start = Math.max(0, index - 28);
  const end = Math.min(normalized.length, index + query.length + 56);
  return `${start > 0 ? '…' : ''}${normalized.slice(start, end)}${end < normalized.length ? '…' : ''}`;
};

/**
 * 搜索标题与消息，同一会话只保留一条最相关结果。
 */
export const searchSessions = (db: DatabaseSync, rawQuery: string): SessionSearchResult[] => {
  const query = rawQuery.trim();
  if (!query) return [];

  const pattern = `%${escapeLike(query)}%`;
  const results = new Map<string, SessionSearchResult>();

  const titleRows = db
    .prepare(
      `SELECT id, title, last_active_at
       FROM sessions
       WHERE deleted_at IS NULL AND title LIKE ? ESCAPE '\\'
       ORDER BY last_active_at DESC
       LIMIT 30`
    )
    .all(pattern) as unknown as TitleRow[];

  for (const row of titleRows) {
    results.set(row.id, {
      sessionId: row.id,
      title: row.title,
      snippet: '',
      kind: 'title',
      matchedAt: Number(row.last_active_at)
    });
  }

  const messageRows = db
    .prepare(
      `SELECT e.session_id AS sessionId, s.title, e.ts, e.payload
       FROM events e
       JOIN sessions s ON s.id = e.session_id
       WHERE s.deleted_at IS NULL
         AND e.type = 'message.completed'
         AND e.payload LIKE ? ESCAPE '\\'
       ORDER BY e.ts DESC
       LIMIT 200`
    )
    .all(pattern) as unknown as MessageRow[];

  for (const row of messageRows) {
    let payload: MessagePayload;
    try {
      payload = JSON.parse(row.payload) as MessagePayload;
    } catch {
      continue;
    }
    if (typeof payload.content !== 'string') continue;
    if (!payload.content.toLocaleLowerCase().includes(query.toLocaleLowerCase())) continue;
    if (results.get(row.sessionId)?.kind === 'message') continue;

    results.set(row.sessionId, {
      sessionId: row.sessionId,
      title: row.title,
      snippet: toSnippet(payload.content, query),
      kind: 'message',
      matchedAt: Number(row.ts)
    });
  }

  return [...results.values()].sort((a, b) => b.matchedAt - a.matchedAt).slice(0, 40);
};
