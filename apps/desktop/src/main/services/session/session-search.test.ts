/**
 * 跨会话搜索测试：消息命中、片段高亮与已删除会话过滤。
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { createNexusEvent } from '@nexus/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../storage/database';
import { EventStore } from './event-store';
import { searchSessions } from './session-search';
import { SessionService } from './session-service';

describe('session search', () => {
  let directory = '';
  let db: DatabaseSync;
  let sessions: SessionService;
  let events: EventStore;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nexus-search-'));
    db = createDatabase(join(directory, 'nexus.db'));
    events = new EventStore(db);
    sessions = new SessionService(db, events);
  });

  afterEach(async () => {
    db.close();
    await rm(directory, { recursive: true, force: true });
  });

  const addMessage = (
    sessionId: string,
    content: string,
    role: 'user' | 'assistant' = 'assistant'
  ): string => {
    const messageId = crypto.randomUUID();
    events.append(
      createNexusEvent({
        sessionId,
        seq: 1,
        type: 'message.completed',
        payload: { messageId, role, content }
      })
    );
    return messageId;
  };

  it('returns a message hit with a highlighted snippet', () => {
    const session = sessions.create({ title: 'Provider 流式解析' });
    const messageId = addMessage(
      session.id,
      '工具调用参数在结束事件前被截断，需要补一次缓冲刷新。'
    );

    const [result] = searchSessions(db, '截断');
    expect(result).toMatchObject({
      sessionId: session.id,
      sessionTitle: 'Provider 流式解析',
      messageId,
      role: 'assistant'
    });
    expect(result?.snippet).toContain('截断');
    expect(result?.snippet.slice(result.matchStart, result.matchEnd)).toBe('截断');
  });

  it('uses the FTS index for longer Chinese queries', () => {
    const session = sessions.create({ title: 'FTS 会话' });
    const messageId = addMessage(session.id, '这是一段流式输出验证，稍后逐步出现。', 'assistant');

    const [result] = searchSessions(db, '流式输出');
    expect(result).toMatchObject({
      sessionId: session.id,
      messageId,
      role: 'assistant'
    });
  });

  it('does not match session titles alone', () => {
    sessions.create({ title: '上下文压缩策略' });
    expect(searchSessions(db, '压缩')).toEqual([]);
  });

  it('excludes deleted sessions', () => {
    const session = sessions.create({ title: '临时会话' });
    addMessage(session.id, '需要删除的内容');
    sessions.remove(session.id);

    expect(searchSessions(db, '删除的内容')).toEqual([]);
  });
});
