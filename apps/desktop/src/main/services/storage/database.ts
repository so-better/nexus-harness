/* SQLite 主库：负责打开、迁移与单例生命周期。 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { getAppDataPaths } from './paths';

let database: DatabaseSync | undefined;

const migrate = (db: DatabaseSync): void => {
  const row = db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined;
  const version = Number(row?.user_version ?? 0);

  if (version < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT,
        title TEXT NOT NULL,
        title_source TEXT NOT NULL DEFAULT 'auto',
        pinned INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'idle',
        mode TEXT NOT NULL DEFAULT 'build',
        provider_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_active_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        run_id TEXT,
        seq INTEGER NOT NULL,
        type TEXT NOT NULL,
        version INTEGER NOT NULL,
        ts INTEGER NOT NULL,
        payload TEXT NOT NULL,
        UNIQUE(session_id, seq)
      );

      CREATE INDEX IF NOT EXISTS idx_events_session_seq ON events(session_id, seq);
      CREATE INDEX IF NOT EXISTS idx_runs_session ON runs(session_id);
    `);
    db.exec('PRAGMA user_version = 1');
  }

  if (version < 2) {
    db.exec('ALTER TABLE sessions ADD COLUMN deleted_at INTEGER');
    db.exec('PRAGMA user_version = 2');
  }
};

/* 打开任意路径的数据库并完成迁移，供主进程与测试共用。 */
export const createDatabase = (filePath: string): DatabaseSync => {
  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  migrate(db);
  return db;
};

/* 打开主库并执行迁移；启动流程在 app ready 后调用。 */
export const initDatabase = (): DatabaseSync => {
  if (database) return database;

  const paths = getAppDataPaths();
  mkdirSync(paths.root, { recursive: true });

  database = createDatabase(join(paths.root, 'nexus.db'));
  return database;
};

/* 获取已初始化的主库；未初始化时抛错，避免静默使用临时库。 */
export const getDatabase = (): DatabaseSync => {
  if (!database) throw new Error('数据库尚未初始化');
  return database;
};

/* 关闭主库，应用退出时调用。 */
export const closeDatabase = (): void => {
  database?.close();
  database = undefined;
};
