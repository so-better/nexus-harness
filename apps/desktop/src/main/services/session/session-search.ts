/**
 * 跨会话消息搜索：匹配 message.completed 内容并返回可定位的消息命中。
 */

import type { DatabaseSync } from 'node:sqlite';
import type { SessionSearchResult } from '@shared/ipc/contracts';

interface MessageRow {
  sessionId: string;
  sessionTitle: string;
  ts: number;
  payload: string;
}

interface MessagePayload {
  messageId?: unknown;
  role?: unknown;
  content?: unknown;
}

const escapeLike = (value: string): string => value.replace(/[\\%_]/g, '\\$&');

/**
 * 压平消息正文并截取命中片段，同时返回片段内高亮下标。
 */
const buildSnippet = (
  content: string,
  query: string
): { snippet: string; matchStart: number; matchEnd: number } | undefined => {
  const normalized = content.replace(/\s+/g, ' ').trim();
  const index = normalized.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if (index < 0) return undefined;

  const start = Math.max(0, index - 30);
  const end = Math.min(normalized.length, index + query.length + 60);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < normalized.length ? '…' : '';
  const snippet = `${prefix}${normalized.slice(start, end)}${suffix}`;
  const matchStart = prefix.length + index - start;
  return {
    snippet,
    matchStart,
    matchEnd: matchStart + query.length
  };
};

/**
 * 搜索所有未删除会话的消息正文，按消息时间倒序返回。
 */
export const searchSessions = (db: DatabaseSync, rawQuery: string): SessionSearchResult[] => {
  const query = rawQuery.trim();
  if (!query) return [];

  const pattern = `%${escapeLike(query)}%`;
  const rows = db
    .prepare(
      `SELECT e.session_id AS sessionId, s.title AS sessionTitle, e.ts, e.payload
       FROM events e
       JOIN sessions s ON s.id = e.session_id
       WHERE s.deleted_at IS NULL
         AND e.type = 'message.completed'
         AND e.payload LIKE ? ESCAPE '\\'
       ORDER BY e.ts DESC
       LIMIT 200`
    )
    .all(pattern) as unknown as MessageRow[];

  const results: SessionSearchResult[] = [];

  for (const row of rows) {
    let payload: MessagePayload;
    try {
      payload = JSON.parse(row.payload) as MessagePayload;
    } catch {
      continue;
    }

    if (typeof payload.content !== 'string' || typeof payload.messageId !== 'string') continue;
    if (payload.role !== 'user' && payload.role !== 'assistant') continue;

    const snippet = buildSnippet(payload.content, query);
    if (!snippet) continue;

    results.push({
      sessionId: row.sessionId,
      sessionTitle: row.sessionTitle,
      messageId: payload.messageId,
      role: payload.role,
      snippet: snippet.snippet,
      matchStart: snippet.matchStart,
      matchEnd: snippet.matchEnd,
      matchedAt: Number(row.ts)
    });
  }

  return results;
};
