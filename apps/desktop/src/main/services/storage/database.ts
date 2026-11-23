/**
 * SQLite 主库：负责打开、迁移与单例生命周期。
 */

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

  if (version < 3) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        run_id TEXT,
        label TEXT NOT NULL,
        path TEXT NOT NULL,
        bytes INTEGER NOT NULL,
        mime TEXT NOT NULL DEFAULT 'text/plain',
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_artifacts_session ON artifacts(session_id);
    `);
    db.exec('PRAGMA user_version = 3');
  }

  if (version < 4) {
    db.exec('ALTER TABLE sessions ADD COLUMN model_id TEXT');
    db.exec('PRAGMA user_version = 4');
  }

  if (version < 5) {
    try {
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS session_message_search USING fts5(
          session_id UNINDEXED,
          message_id UNINDEXED,
          role UNINDEXED,
          content,
          ts UNINDEXED,
          tokenize = 'trigram'
        );
      `);
      db.exec(`
        INSERT INTO session_message_search (session_id, message_id, role, content, ts)
        SELECT e.session_id,
               json_extract(e.payload, '$.messageId'),
               json_extract(e.payload, '$.role'),
               json_extract(e.payload, '$.content'),
               e.ts
        FROM events e
        WHERE e.type = 'message.completed'
          AND json_extract(e.payload, '$.messageId') IS NOT NULL
          AND json_extract(e.payload, '$.content') IS NOT NULL;
      `);
    } catch (error) {
      console.warn('FTS5 搜索索引不可用，降级为 LIKE 搜索', error);
    }
    db.exec('PRAGMA user_version = 5');
  }

  if (version < 6) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS session_roots (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        kind TEXT NOT NULL,
        access TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'session',
        created_at INTEGER NOT NULL,
        UNIQUE(session_id, path)
      );

      CREATE INDEX IF NOT EXISTS idx_session_roots_session ON session_roots(session_id);
    `);
    db.exec('PRAGMA user_version = 6');
  }

  if (version < 7) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        run_id TEXT,
        name TEXT NOT NULL,
        mime TEXT NOT NULL,
        bytes INTEGER NOT NULL,
        source TEXT NOT NULL,
        stored_path TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_files_session ON files(session_id);
    `);
    db.exec('PRAGMA user_version = 7');
  }

  if (version < 8) {
    // 工作区改为单 root；不兼容旧的多 root 数据，直接重建授权表。
    db.exec(`
      DROP TABLE IF EXISTS session_roots;
      CREATE TABLE session_roots (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        kind TEXT NOT NULL,
        access TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'session',
        created_at INTEGER NOT NULL,
        UNIQUE(session_id)
      );

      CREATE INDEX IF NOT EXISTS idx_session_roots_session ON session_roots(session_id);
    `);
    db.exec('PRAGMA user_version = 8');
  }

  if (version < 10) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        mime TEXT NOT NULL,
        bytes INTEGER NOT NULL,
        stored_path TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_attachments_session ON attachments(session_id);
    `);
    db.exec('PRAGMA user_version = 10');
  }

  if (version < 9) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS plugins (
        id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 1,
        error TEXT,
        source TEXT NOT NULL DEFAULT 'user',
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS plugin_storage (
        plugin_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (plugin_id, key)
      );
    `);
    db.exec('PRAGMA user_version = 9');
  }

  if (version < 11) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_events_type_ts ON events(type, ts)');
    db.exec('PRAGMA user_version = 11');
  }

  if (version < 12) {
    db.exec("ALTER TABLE sessions ADD COLUMN approval_policy TEXT NOT NULL DEFAULT 'ask'");
    db.exec('PRAGMA user_version = 12');
  }

  if (version < 13) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS memory_items (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        pinned INTEGER NOT NULL DEFAULT 0,
        priority INTEGER NOT NULL DEFAULT 50,
        source_session_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_used_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_memory_items_status
        ON memory_items(status, pinned, priority, updated_at);

      CREATE TABLE IF NOT EXISTS memory_events (
        id TEXT PRIMARY KEY,
        memory_id TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        ts INTEGER NOT NULL
      );
    `);
    db.exec('PRAGMA user_version = 13');
  }

  if (version < 14) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS memory_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        auto_capture INTEGER NOT NULL DEFAULT 1,
        retrieval INTEGER NOT NULL DEFAULT 1
      );
    `);
    db.exec('PRAGMA user_version = 14');
  }

  if (version < 15) {
    db.exec("UPDATE memory_items SET status = 'active' WHERE status = 'archived'");
    db.exec('PRAGMA user_version = 15');
  }

  if (version < 16) {
    try {
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
          memory_id UNINDEXED,
          title,
          content,
          tokenize = 'trigram'
        );
        INSERT INTO memory_fts (memory_id, title, content)
        SELECT id, title, content FROM memory_items;
      `);
    } catch (error) {
      console.warn('记忆 FTS5 索引不可用，降级为 LIKE 搜索', error);
    }
    db.exec('PRAGMA user_version = 16');
  }

  if (version < 17) {
    db.exec('DROP INDEX IF EXISTS idx_memory_items_status');
    db.exec('ALTER TABLE memory_items DROP COLUMN pinned');
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_memory_items_status ON memory_items(status, priority, updated_at)'
    );
    db.exec('PRAGMA user_version = 17');
  }
};

/**
 * 打开任意路径的数据库并完成迁移，供主进程与测试共用。
 */
export const createDatabase = (filePath: string): DatabaseSync => {
  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  migrate(db);
  return db;
};

/**
 * 打开主库并执行迁移；启动流程在 app ready 后调用。
 */
export const initDatabase = (): DatabaseSync => {
  if (database) return database;

  const paths = getAppDataPaths();
  mkdirSync(paths.root, { recursive: true });

  database = createDatabase(join(paths.root, 'nexus.db'));
  return database;
};

/**
 * 获取已初始化的主库；未初始化时抛错，避免静默使用临时库。
 */
export const getDatabase = (): DatabaseSync => {
  if (!database) throw new Error('数据库尚未初始化');
  return database;
};

/**
 * 关闭主库，应用退出时调用。
 */
export const closeDatabase = (): void => {
  database?.close();
  database = undefined;
};
