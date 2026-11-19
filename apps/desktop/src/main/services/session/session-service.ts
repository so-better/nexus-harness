/**
 * 会话投影：读写 sessions 表，事件流仍是业务真相。
 */

import { randomUUID } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import { createNexusEvent } from '@nexus/core';
import { assertGrantableRoot } from '@nexus/runtime-utils';
import type { DatabaseSync } from 'node:sqlite';
import type {
  AgentMode,
  SessionCreateInput,
  SessionRenameInput,
  SessionRoot,
  SessionSetModeInput,
  SessionSetModelInput,
  SessionStatus,
  SessionSummary
} from '@shared/ipc/contracts';
import type { EventStore } from './event-store';

interface SessionRootRow {
  id: string;
  session_id: string;
  path: string;
  kind: string;
  access: string;
  source: string;
  created_at: number;
}

interface SessionRow {
  id: string;
  workspace_id: string | null;
  title: string;
  title_source: string;
  pinned: number;
  status: string;
  mode: string;
  provider_id: string | null;
  model_id: string | null;
  created_at: number;
  updated_at: number;
  last_active_at: number;
}

const DEFAULT_SESSION_TITLE = '新会话';

const toRoot = (row: SessionRootRow): SessionRoot => ({
  id: row.id,
  sessionId: row.session_id,
  path: row.path,
  kind: row.kind === 'file' ? 'file' : 'directory',
  access: row.access === 'read' ? 'read' : 'write',
  source: row.source === 'workspace' ? 'workspace' : 'session',
  createdAt: Number(row.created_at)
});

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
  ...(row.provider_id ? { providerId: row.provider_id } : {}),
  ...(row.model_id ? { modelId: row.model_id } : {})
});

export class SessionService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly events: EventStore
  ) {}

  /**
   * 创建会话；标题暂用默认值，后续由 AI 摘要或用户重命名。
   */
  create(input: SessionCreateInput = {}): SessionSummary {
    const id = randomUUID();
    const now = Date.now();
    const title = input.title?.trim() || DEFAULT_SESSION_TITLE;
    const mode = input.mode ?? 'build';

    return this.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO sessions
            (id, workspace_id, title, title_source, pinned, status, mode, provider_id, model_id, created_at, updated_at, last_active_at)
           VALUES (?, ?, ?, 'auto', 0, 'idle', ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          input.workspaceId ?? null,
          title,
          mode,
          input.providerId ?? null,
          input.modelId ?? null,
          now,
          now,
          now
        );

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

  /**
   * 列出会话已授权的 root。
   */
  listRoots(sessionId: string): SessionRoot[] {
    const rows = this.db
      .prepare('SELECT * FROM session_roots WHERE session_id = ? ORDER BY created_at ASC LIMIT 1')
      .all(sessionId) as unknown as SessionRootRow[];
    return rows.map(toRoot);
  }

  /**
   * 授权一组路径；目录可写，单文件只授予读权限。
   */
  async addRoots(sessionId: string, paths: string[]): Promise<SessionRoot[]> {
    const now = Date.now();
    const resolved = await Promise.all(
      paths.map(async (path) => {
        const canonical = await realpath(path);
        assertGrantableRoot(canonical);
        const info = await stat(canonical);
        return {
          path: canonical,
          kind: info.isDirectory() ? ('directory' as const) : ('file' as const),
          access: info.isDirectory() ? ('write' as const) : ('read' as const)
        };
      })
    );

    const root = resolved[0];
    if (!root) return this.listRoots(sessionId);

    this.transaction(() => {
      const previous = this.db
        .prepare('SELECT * FROM session_roots WHERE session_id = ?')
        .all(sessionId) as unknown as SessionRootRow[];
      this.db.prepare('DELETE FROM session_roots WHERE session_id = ?').run(sessionId);
      for (const old of previous) {
        this.events.append(
          createNexusEvent({
            sessionId,
            seq: 1,
            type: 'scope.revoked',
            payload: { path: old.path }
          })
        );
      }

      this.db
        .prepare(
          `INSERT INTO session_roots
            (id, session_id, path, kind, access, source, created_at)
           VALUES (?, ?, ?, ?, ?, 'session', ?)`
        )
        .run(randomUUID(), sessionId, root.path, root.kind, root.access, now);
      this.events.append(
        createNexusEvent({
          sessionId,
          seq: 1,
          type: 'scope.granted',
          payload: {
            path: root.path,
            kind: root.kind,
            access: root.access,
            source: 'session'
          }
        })
      );
    });

    return this.listRoots(sessionId);
  }

  /**
   * 撤销 root 授权；只删除授权记录，不删除用户文件。
   */
  removeRoot(sessionId: string, rootId: string): SessionRoot[] {
    const root = this.db
      .prepare('SELECT * FROM session_roots WHERE session_id = ? AND id = ?')
      .get(sessionId, rootId) as SessionRootRow | undefined;
    if (!root) return this.listRoots(sessionId);

    this.transaction(() => {
      this.db.prepare('DELETE FROM session_roots WHERE id = ?').run(rootId);
      this.events.append(
        createNexusEvent({
          sessionId,
          seq: 1,
          type: 'scope.revoked',
          payload: { path: root.path }
        })
      );
    });
    return this.listRoots(sessionId);
  }

  /**
   * 列出会话：置顶优先，其次按最近活跃排序。
   */
  list(): SessionSummary[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM sessions WHERE deleted_at IS NULL ORDER BY pinned DESC, last_active_at DESC'
      )
      .all() as unknown as SessionRow[];
    return rows.map(toSummary);
  }

  /**
   * 读取会话；不存在返回 undefined。
   */
  get(id: string): SessionSummary | undefined {
    const row = this.db
      .prepare('SELECT * FROM sessions WHERE id = ? AND deleted_at IS NULL')
      .get(id) as unknown as SessionRow | undefined;
    return row ? toSummary(row) : undefined;
  }

  /**
   * 写入自动标题；只更新仍处于默认标题且来源为 auto 的会话。
   */
  setAutoTitle(id: string, title: string): SessionSummary | undefined {
    const current = this.get(id);
    if (
      !current ||
      current.titleSource !== 'auto' ||
      current.title !== DEFAULT_SESSION_TITLE ||
      !title.trim()
    ) {
      return undefined;
    }

    const now = Date.now();
    return this.transaction(() => {
      const result = this.db
        .prepare(
          "UPDATE sessions SET title = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL AND title_source = 'auto' AND title = ?"
        )
        .run(title.trim(), now, id, DEFAULT_SESSION_TITLE);
      if (Number(result.changes) === 0) return undefined;
      this.events.append(
        createNexusEvent({
          sessionId: id,
          seq: 1,
          type: 'session.renamed',
          payload: { title: title.trim(), source: 'auto' }
        })
      );
      return this.get(id);
    });
  }

  /**
   * 用户重命名；titleSource 变为 user，后续自动标题不得覆盖。
   */
  rename(input: SessionRenameInput): SessionSummary {
    const now = Date.now();

    return this.transaction(() => {
      this.db
        .prepare(
          "UPDATE sessions SET title = ?, title_source = 'user', updated_at = ?, last_active_at = ? WHERE id = ? AND deleted_at IS NULL"
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

  /**
   * 删除会话；事件与 Run 由外键级联清理。
   */
  remove(id: string): void {
    const now = Date.now();

    this.transaction(() => {
      this.events.append(
        createNexusEvent({ sessionId: id, seq: 1, type: 'session.removed', payload: {} })
      );
      this.db.prepare('DELETE FROM session_roots WHERE session_id = ?').run(id);
      this.db
        .prepare('UPDATE sessions SET deleted_at = ?, updated_at = ? WHERE id = ?')
        .run(now, now, id);
    });
  }

  /**
   * 清除全部会话；事件保留用于审计。
   */
  removeAll(): { removed: number } {
    const rows = this.db
      .prepare('SELECT id FROM sessions WHERE deleted_at IS NULL')
      .all() as unknown as Array<{ id: string }>;
    const now = Date.now();

    return this.transaction(() => {
      for (const row of rows) {
        this.events.append(
          createNexusEvent({ sessionId: row.id, seq: 1, type: 'session.removed', payload: {} })
        );
        this.db.prepare('DELETE FROM session_roots WHERE session_id = ?').run(row.id);
        this.db
          .prepare('UPDATE sessions SET deleted_at = ?, updated_at = ? WHERE id = ?')
          .run(now, now, row.id);
      }
      return { removed: rows.length };
    });
  }

  /**
   * 设置置顶状态并写入事件。
   */
  setPinned(id: string, pinned: boolean): SessionSummary {
    const now = Date.now();

    return this.transaction(() => {
      this.db
        .prepare(
          'UPDATE sessions SET pinned = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL'
        )
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

  /**
   * 更新会话当前服务商与模型。
   */
  setModel(input: SessionSetModelInput): SessionSummary {
    const now = Date.now();
    return this.transaction(() => {
      this.db
        .prepare(
          'UPDATE sessions SET provider_id = ?, model_id = ?, updated_at = ?, last_active_at = ? WHERE id = ? AND deleted_at IS NULL'
        )
        .run(input.providerId, input.modelId, now, now, input.id);
      this.events.append(
        createNexusEvent({
          sessionId: input.id,
          seq: 1,
          type: 'session.model.changed',
          payload: { providerId: input.providerId, modelId: input.modelId }
        })
      );
      return this.getRequired(input.id);
    });
  }

  /**
   * 设置 Agent 模式；仅由用户操作触发。
   */
  setMode(input: SessionSetModeInput): SessionSummary {
    const now = Date.now();

    return this.transaction(() => {
      this.db
        .prepare(
          'UPDATE sessions SET mode = ?, updated_at = ?, last_active_at = ? WHERE id = ? AND deleted_at IS NULL'
        )
        .run(input.mode, now, now, input.id);
      this.events.append(
        createNexusEvent({
          sessionId: input.id,
          seq: 1,
          type: 'session.mode.changed',
          payload: { mode: input.mode }
        })
      );
      return this.getRequired(input.id);
    });
  }

  /**
   * 更新会话状态与最近活跃时间。
   */
  setStatus(id: string, status: SessionStatus): void {
    const now = Date.now();
    this.db
      .prepare(
        'UPDATE sessions SET status = ?, updated_at = ?, last_active_at = ? WHERE id = ? AND deleted_at IS NULL'
      )
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
