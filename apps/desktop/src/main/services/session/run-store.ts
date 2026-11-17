/* Run 投影：记录运行状态，启动时把未完成 Run 标记为 interrupted。 */

import type { DatabaseSync } from 'node:sqlite';

interface RunRow {
  id: string;
  session_id: string;
  status: string;
  started_at: number;
}

export class RunStore {
  constructor(private readonly db: DatabaseSync) {}

  /* 创建运行记录。 */
  create(runId: string, sessionId: string, startedAt = Date.now()): void {
    this.db
      .prepare('INSERT INTO runs (id, session_id, status, started_at) VALUES (?, ?, ?, ?)')
      .run(runId, sessionId, 'running', startedAt);
  }

  /* 更新运行状态并记录结束时间。 */
  updateStatus(runId: string, status: string): void {
    const endedAt = ['succeeded', 'failed', 'cancelled', 'interrupted'].includes(status)
      ? Date.now()
      : null;
    this.db
      .prepare('UPDATE runs SET status = ?, ended_at = ? WHERE id = ?')
      .run(status, endedAt, runId);
  }

  /* 启动时中断所有未完成 Run，返回受影响的记录。 */
  markInterrupted(): RunRow[] {
    const rows = this.db
      .prepare(
        "SELECT id, session_id, status, started_at FROM runs WHERE status IN ('queued', 'running', 'waiting_approval', 'waiting_user')"
      )
      .all() as unknown as RunRow[];

    if (rows.length) {
      this.db
        .prepare(
          "UPDATE runs SET status = 'interrupted', ended_at = ? WHERE status IN ('queued', 'running', 'waiting_approval', 'waiting_user')"
        )
        .run(Date.now());
    }

    return rows;
  }
}
