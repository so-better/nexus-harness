/**
 * 跨会话消息搜索：优先 FTS5 索引，短关键词或索引不可用时降级为 LIKE。
 */

import type { DatabaseSync } from 'node:sqlite';
import type { SessionSearchResult } from '@shared/ipc/contracts';

interface SearchRow {
  sessionId: string;
  sessionTitle: string;
  messageId: string;
  role: string;
  content: string;
  ts: number;
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
 * FTS5 查询；中文两字以内不走 trigram，避免漏命中。
 */
const searchWithFts = (db: DatabaseSync, query: string): SearchRow[] => {
  const ftsQuery = `"${query.replace(/"/g, '""')}"`;
  return db
    .prepare(
      `SELECT m.session_id AS sessionId,
              s.title AS sessionTitle,
              m.message_id AS messageId,
              m.role AS role,
              m.content AS content,
              m.ts AS ts
       FROM session_message_search m
       JOIN sessions s ON s.id = m.session_id
       WHERE session_message_search MATCH ?
         AND s.deleted_at IS NULL
       ORDER BY m.ts DESC
       LIMIT 200`
    )
    .all(ftsQuery) as unknown as SearchRow[];
};

/**
 * LIKE 兜底查询；只扫描 message.completed 的正文。
 */
const searchWithLike = (db: DatabaseSync, pattern: string): SearchRow[] =>
  db
    .prepare(
      `SELECT e.session_id AS sessionId,
              s.title AS sessionTitle,
              json_extract(e.payload, '$.messageId') AS messageId,
              json_extract(e.payload, '$.role') AS role,
              json_extract(e.payload, '$.content') AS content,
              e.ts AS ts
       FROM events e
       JOIN sessions s ON s.id = e.session_id
       WHERE s.deleted_at IS NULL
         AND e.type = 'message.completed'
         AND json_extract(e.payload, '$.content') LIKE ? ESCAPE '\\'
       ORDER BY e.ts DESC
       LIMIT 200`
    )
    .all(pattern) as unknown as SearchRow[];

/**
 * 搜索所有未删除会话的消息正文，按消息时间倒序返回。
 */
export const searchSessions = (db: DatabaseSync, rawQuery: string): SessionSearchResult[] => {
  const query = rawQuery.trim();
  if (!query) return [];

  let rows: SearchRow[];
  if (Array.from(query).length >= 3) {
    try {
      rows = searchWithFts(db, query);
    } catch {
      rows = searchWithLike(db, `%${escapeLike(query)}%`);
    }
  } else {
    rows = searchWithLike(db, `%${escapeLike(query)}%`);
  }

  const results: SessionSearchResult[] = [];

  for (const row of rows) {
    if (typeof row.content !== 'string' || typeof row.messageId !== 'string') continue;
    if (row.role !== 'user' && row.role !== 'assistant') continue;

    const snippet = buildSnippet(row.content, query);
    if (!snippet) continue;

    results.push({
      sessionId: row.sessionId,
      sessionTitle: row.sessionTitle,
      messageId: row.messageId,
      role: row.role,
      snippet: snippet.snippet,
      matchStart: snippet.matchStart,
      matchEnd: snippet.matchEnd,
      matchedAt: Number(row.ts)
    });
  }

  return results;
};
