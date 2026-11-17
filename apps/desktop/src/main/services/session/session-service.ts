/* 会话投影：读写 sessions 表，事件流仍是业务真相。 */

import { randomUUID } from 'node:crypto';
import { createNexusEvent } from '@nexus/core';
import type { DatabaseSync } from 'node:sqlite';
import type {
  AgentMode,
  SessionCreateInput,
  SessionRenameInput,
  SessionStatus,
  SessionSummary
} from '@shared/ipc/contracts';
import type { EventStore } from './event-store';

interface SessionRow {
  id: string;
  workspace_id: string | null;
  title: string;
  title_source: string;
  pinned: number;
  status: string;
  mode: string;
  provider_id: string | null;
  created_at: number;
  updated_at: number;
  last_active_at: number;
}

const toSummary = (row: SessionRow): SessionSummary => ({
  id: row.id,
  title: row.title,
  titleSource: row.title_source === 'user' ? 'user' : 'auto',
  pinned: row.pinned === 1,
  status: row.status as SessionStatus,
  mode: row.mode as AgentMode,
  createdAt: Number(row.created_at),
  updatedAt: Number(row.updated_at),
  lastActiveAt: Number(row.last_active_at),
  ...(row.workspace_id ? { workspaceId: row.workspace_id } : {}),
  ...(row.provider_id ? { providerId: row.provider_id } : {})
});

export class SessionService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly events: EventStore
  ) {}

  /* 创建会话；标题暂用默认值，后续由 AI 摘要或用户重命名。 */
  create(input: SessionCreateInput = {}): SessionSummary {
    const id = randomUUID();
    const now = Date.now();
    const title = input.title?.trim() || '新会话';
    const mode = input.mode ?? 'build';

    return this.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO sessions
            (id, workspace_id, title, title_source, pinned, status, mode, provider_id, created_at, updated_at, last_active_at)
           VALUES (?, ?, ?, 'auto', 0, 'idle', ?, ?, ?, ?, ?)`
        )
        .run(id, input.workspaceId ?? null, title, mode, input.providerId ?? null, now, now, now);

      this.events.append(
        createNexusEvent({
          sessionId: id,
          seq: 1,
          type: 'session.created',
          payload: {
            ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
            title
          }
        })
      );

      return this.getRequired(id);
    });
  }

  /* 列出会话：置顶优先，其次按最近活跃排序。 */
  list(): SessionSummary[] {
    const rows = this.db
      .prepare('SELECT * FROM sessions ORDER BY pinned DESC, last_active_at DESC')
      .all() as unknown as SessionRow[];
    return rows.map(toSummary);
  }

  /* 读取会话；不存在返回 undefined。 */
  get(id: string): SessionSummary | undefined {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as unknown as
      SessionRow | undefined;
    return row ? toSummary(row) : undefined;
  }

  /* 用户重命名；titleSource 变为 user，后续自动标题不得覆盖。 */
  rename(input: SessionRenameInput): SessionSummary {
    const now = Date.now();

    return this.transaction(() => {
      this.db
        .prepare(
          "UPDATE sessions SET title = ?, title_source = 'user', updated_at = ?, last_active_at = ? WHERE id = ?"
        )
        .run(input.title, now, now, input.id);

      this.events.append(
        createNexusEvent({
          sessionId: input.id,
          seq: 1,
          type: 'session.renamed',
          payload: { title: input.title, source: 'user' }
        })
      );

      return this.getRequired(input.id);
    });
  }

  /* 删除会话；事件与 Run 由外键级联清理。 */
  remove(id: string): void {
    this.transaction(() => {
      this.events.append(
        createNexusEvent({ sessionId: id, seq: 1, type: 'session.removed', payload: {} })
      );
      this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    });
  }

  /* 设置置顶状态并写入事件。 */
  setPinned(id: string, pinned: boolean): SessionSummary {
    const now = Date.now();

    return this.transaction(() => {
      this.db
        .prepare('UPDATE sessions SET pinned = ?, updated_at = ? WHERE id = ?')
        .run(pinned ? 1 : 0, now, id);
      this.events.append(
        createNexusEvent({
          sessionId: id,
          seq: 1,
          type: pinned ? 'session.pinned' : 'session.unpinned',
          payload: {}
        })
      );
      return this.getRequired(id);
    });
  }

  /* 更新会话状态与最近活跃时间。 */
  setStatus(id: string, status: SessionStatus): void {
    const now = Date.now();
    this.db
      .prepare('UPDATE sessions SET status = ?, updated_at = ?, last_active_at = ? WHERE id = ?')
      .run(status, now, now, id);
  }

  private transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private getRequired(id: string): SessionSummary {
    const session = this.get(id);
    if (!session) throw new Error(`会话不存在：${id}`);
    return session;
  }
}
