/**
 * 知识库服务：导入文本来源、切分索引、全文检索与重建。
 */

import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { basename, extname, join, relative, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { readTextFileOrExtract } from '@nexus/toolkit';
import type {
  KnowledgeImportResult,
  KnowledgeSearchHit,
  KnowledgeSearchInput,
  KnowledgeSource,
  KnowledgeSourceKind,
  KnowledgeSourceStatus
} from '@shared/knowledge';
import { knowledgeSearchInputSchema } from '@shared/knowledge';
import { chunkKnowledgeText } from './chunk-text';
import { getAppDataPaths } from '../storage/paths';

interface KnowledgeSourceRow {
  id: string;
  name: string;
  kind: string;
  origin_path: string | null;
  mime: string | null;
  bytes: number;
  raw_text: string;
  stored_path: string | null;
  status: string;
  error: string | null;
  chunk_count: number;
  created_at: number;
  updated_at: number;
}

interface KnowledgeChunkRow {
  id: string;
  source_id: string;
  ordinal: number;
  heading: string | null;
  content: string;
  source_name: string;
  origin_path: string | null;
  stored_path: string | null;
}

const MAX_SOURCE_BYTES = 2_000_000;
const MAX_IMPORT_FILE_BYTES = 10_000_000;
const MAX_DIRECTORY_FILES = 500;
const MAX_IMPORT_TOTAL_BYTES = 30_000_000;
const MAX_SEARCH_LIMIT = 20;
const MISSING_SOURCE_ERROR = '本地文件已删除';
const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.svn',
  '.hg',
  'node_modules',
  'dist',
  'out',
  'build',
  '.next',
  'coverage'
]);
const BINARY_EXTENSIONS = /\.(png|jpe?g|gif|webp|bmp|ico|mp3|mp4|wav|mov|woff2?|ttf|otf)$/i;

const safeName = (name: string): string => {
  const cleaned = name
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, '_')
    .trim()
    .slice(0, 240);
  return cleaned || '未命名来源';
};

const escapeLike = (value: string): string => value.replace(/[\\%_]/g, '\\$&');

const toSource = (row: KnowledgeSourceRow): KnowledgeSource => ({
  id: row.id,
  name: row.name,
  kind: row.kind as KnowledgeSourceKind,
  ...(row.origin_path ? { originPath: row.origin_path } : {}),
  ...(row.mime ? { mime: row.mime } : {}),
  bytes: Number(row.bytes),
  chunkCount: Number(row.chunk_count),
  status: row.status as KnowledgeSourceStatus,
  ...(row.error ? { error: row.error } : {}),
  createdAt: Number(row.created_at),
  updatedAt: Number(row.updated_at)
});

const mimeFor = (path: string): string | undefined => {
  switch (extname(path).toLowerCase()) {
    case '.md':
    case '.markdown':
      return 'text/markdown';
    case '.txt':
    case '.log':
      return 'text/plain';
    case '.json':
      return 'application/json';
    case '.csv':
      return 'text/csv';
    case '.html':
    case '.htm':
      return 'text/html';
    case '.pdf':
      return 'application/pdf';
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    default:
      return undefined;
  }
};

const buildSnippet = (
  content: string,
  query: string
): { snippet: string; matchStart: number; matchEnd: number } => {
  const normalized = content.replace(/\s+/g, ' ').trim();
  const index = normalized.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if (index < 0) {
    return { snippet: normalized.slice(0, 240), matchStart: -1, matchEnd: -1 };
  }
  const start = Math.max(0, index - 60);
  const end = Math.min(normalized.length, index + query.length + 120);
  const prefix = start > 0 ? '…' : '';
  const snippet = `${prefix}${normalized.slice(start, end)}${end < normalized.length ? '…' : ''}`;
  const matchStart = prefix.length + index - start;
  return { snippet, matchStart, matchEnd: matchStart + query.length };
};

/**
 * 知识库存储与检索；导入文件复制到 userData/knowledge，不依赖工作区授权。
 */
export class KnowledgeService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly baseDir?: string
  ) {}

  private get knowledgeDirectory(): string {
    return this.baseDir ?? getAppDataPaths().knowledge;
  }

  private rowById(id: string): KnowledgeSourceRow | undefined {
    return this.db.prepare('SELECT * FROM knowledge_sources WHERE id = ?').get(id) as
      KnowledgeSourceRow | undefined;
  }

  /**
   * 列出知识库来源；本地副本缺失时标记失效并隐藏，保留底层数据以便恢复。
   */
  list(): KnowledgeSource[] {
    const rows = this.db
      .prepare('SELECT * FROM knowledge_sources ORDER BY updated_at DESC')
      .all() as unknown as KnowledgeSourceRow[];
    const valid: KnowledgeSourceRow[] = [];
    for (const row of rows) {
      if (row.stored_path && !existsSync(row.stored_path)) {
        if (row.status !== 'error' || row.error !== MISSING_SOURCE_ERROR) {
          this.db
            .prepare(
              'UPDATE knowledge_sources SET status = ?, error = ?, updated_at = ? WHERE id = ?'
            )
            .run('error', MISSING_SOURCE_ERROR, Date.now(), row.id);
        }
        continue;
      }
      if (row.status === 'error' && row.error === MISSING_SOURCE_ERROR) {
        this.db
          .prepare(
            "UPDATE knowledge_sources SET status = 'ready', error = NULL, updated_at = ? WHERE id = ?"
          )
          .run(Date.now(), row.id);
        row.status = 'ready';
        row.error = null;
      }
      valid.push(row);
    }
    return valid.map(toSource);
  }

  /**
   * 获取单个来源。
   */
  find(id: string): KnowledgeSource | undefined {
    const row = this.rowById(id);
    return row ? toSource(row) : undefined;
  }

  /**
   * 同步 FTS 文档；索引不可用时静默降级。
   */
  private syncFts(chunkId: string, sourceId: string, sourceName: string, content: string): void {
    try {
      this.db.prepare('DELETE FROM knowledge_fts WHERE chunk_id = ?').run(chunkId);
      this.db
        .prepare(
          'INSERT INTO knowledge_fts (chunk_id, source_id, source_name, content) VALUES (?, ?, ?, ?)'
        )
        .run(chunkId, sourceId, sourceName, content);
    } catch {
      // FTS5 不可用时主表仍可保存，搜索会走 LIKE
    }
  }

  private removeFtsBySource(sourceId: string): void {
    try {
      this.db.prepare('DELETE FROM knowledge_fts WHERE source_id = ?').run(sourceId);
    } catch {
      // FTS5 不可用时忽略
    }
  }

  /**
   * 写入来源和 chunk；失败时回滚。
   */
  private insertSource(input: {
    id?: string;
    name: string;
    kind: 'file';
    originPath?: string;
    storedPath?: string;
    mime?: string;
    rawText: string;
    status?: KnowledgeSourceStatus;
    error?: string;
  }): KnowledgeSource {
    const id = input.id ?? randomUUID();
    const now = Date.now();
    const chunks = chunkKnowledgeText(input.rawText);
    const bytes = Buffer.byteLength(input.rawText, 'utf8');
    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(
          `INSERT INTO knowledge_sources
           (id, name, kind, origin_path, stored_path, mime, bytes, raw_text, status, error, chunk_count, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          safeName(input.name),
          'file',
          input.originPath ?? null,
          input.storedPath ?? null,
          input.mime ?? null,
          bytes,
          '',
          input.status ?? 'ready',
          input.error ?? null,
          chunks.length,
          now,
          now
        );
      for (const chunk of chunks) {
        const chunkId = randomUUID();
        this.db
          .prepare(
            `INSERT INTO knowledge_chunks
             (id, source_id, ordinal, heading, content, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .run(chunkId, id, chunk.ordinal, chunk.heading ?? null, chunk.content, now);
        this.syncFts(chunkId, id, safeName(input.name), chunk.content);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.find(id)!;
  }

  /**
   * 导入单个文件；失败返回错误说明。
   */
  private async importFile(
    path: string,
    name: string
  ): Promise<{ source?: KnowledgeSource; error?: string }> {
    try {
      const info = await stat(path);
      if (!info.isFile()) return { error: `${name}：不是文件` };
      if (info.size > MAX_IMPORT_FILE_BYTES) return { error: `${name}：文件过大` };
      if (BINARY_EXTENSIONS.test(path)) return { error: `${name}：不支持的二进制类型` };
      const id = randomUUID();
      const directory = join(this.knowledgeDirectory, id);
      await mkdir(directory, { recursive: true });
      const storedPath = join(directory, safeName(basename(path)));
      try {
        await copyFile(path, storedPath);
        const extracted = await readTextFileOrExtract(storedPath, MAX_SOURCE_BYTES);
        const text = extracted.output.trim();
        if (!text) {
          await rm(directory, { recursive: true, force: true });
          return { error: `${name}：没有可提取的文本` };
        }
        return {
          source: this.insertSource({
            id,
            name,
            kind: 'file',
            originPath: resolve(path),
            storedPath,
            ...(mimeFor(path) ? { mime: mimeFor(path)! } : {}),
            rawText: text
          })
        };
      } catch (error) {
        await rm(directory, { recursive: true, force: true }).catch(() => undefined);
        throw error;
      }
    } catch (error) {
      return { error: `${name}：${error instanceof Error ? error.message : '读取失败'}` };
    }
  }

  /**
   * 导入多个文件。
   */
  async importFiles(paths: readonly string[]): Promise<KnowledgeImportResult> {
    const result: KnowledgeImportResult = { sources: [], errors: [] };
    for (const path of paths) {
      const imported = await this.importFile(path, basename(path));
      if (imported.source) result.sources.push(imported.source);
      if (imported.error) result.errors.push(imported.error);
    }
    return result;
  }

  /**
   * 扫描目录候选文件；与导入共用同一套跳过和上限规则。
   */
  private async collectDirectory(root: string): Promise<{
    files: Array<{ path: string; name: string; size: number }>;
    totalBytes: number;
    skipped: number;
    errors: string[];
  }> {
    const directory = resolve(root);
    const info = await stat(directory);
    if (!info.isDirectory()) throw new Error('目标不是目录');
    const files: Array<{ path: string; name: string; size: number }> = [];
    let totalBytes = 0;
    let skipped = 0;
    const errors: string[] = [];

    const walk = async (current: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(current, { withFileTypes: true });
      } catch (error) {
        errors.push(`${current}：${error instanceof Error ? error.message : '读取失败'}`);
        return;
      }
      for (const entry of entries) {
        if (files.length >= MAX_DIRECTORY_FILES) {
          errors.push(`导入文件数超过 ${MAX_DIRECTORY_FILES} 个，已停止`);
          return;
        }
        if (entry.name.startsWith('.') || SKIPPED_DIRECTORIES.has(entry.name)) continue;
        const path = join(current, entry.name);
        if (entry.isDirectory()) {
          await walk(path);
          continue;
        }
        if (!entry.isFile()) continue;
        try {
          const fileInfo = await stat(path);
          if (fileInfo.size > MAX_IMPORT_FILE_BYTES || BINARY_EXTENSIONS.test(path)) {
            skipped += 1;
            continue;
          }
          if (totalBytes + fileInfo.size > MAX_IMPORT_TOTAL_BYTES) {
            errors.push('目录总大小超过上限，已停止');
            return;
          }
          totalBytes += fileInfo.size;
          files.push({ path, name: relative(directory, path), size: fileInfo.size });
        } catch {
          skipped += 1;
        }
      }
    };

    await walk(directory);
    return { files, totalBytes, skipped, errors };
  }

  /**
   * 扫描目录，返回确认预览；不写入数据库或磁盘副本。
   */
  async scanDirectory(root: string): Promise<{
    fileCount: number;
    totalBytes: number;
    skipped: number;
    errors: string[];
  }> {
    const plan = await this.collectDirectory(root);
    return {
      fileCount: plan.files.length,
      totalBytes: plan.totalBytes,
      skipped: plan.skipped,
      errors: plan.errors
    };
  }

  /**
   * 导入目录；目录在扫描与确认之间发生变化时以导入时内容为准。
   */
  async importDirectory(root: string): Promise<KnowledgeImportResult> {
    const plan = await this.collectDirectory(root);
    const result: KnowledgeImportResult = { sources: [], errors: [...plan.errors] };
    for (const file of plan.files) {
      const imported = await this.importFile(file.path, file.name);
      if (imported.source) result.sources.push(imported.source);
      if (imported.error) result.errors.push(imported.error);
    }
    return result;
  }

  /**
   * 删除来源、chunk 与 FTS 记录。
   */
  async remove(id: string): Promise<boolean> {
    if (!this.rowById(id)) return false;
    this.removeFtsBySource(id);
    this.db.prepare('DELETE FROM knowledge_chunks WHERE source_id = ?').run(id);
    this.db.prepare('DELETE FROM knowledge_sources WHERE id = ?').run(id);
    await rm(join(this.knowledgeDirectory, id), { recursive: true, force: true }).catch(
      () => undefined
    );
    return true;
  }

  /**
   * 重新解析来源；文件来源优先重新读取原始文件，失败时保留旧原文。
   */
  async reindex(id: string): Promise<KnowledgeSource | undefined> {
    const row = this.rowById(id);
    if (!row) return undefined;
    let rawText = row.raw_text;
    const sourcePath = row.stored_path ?? row.origin_path;
    if (sourcePath) {
      try {
        // 原文件仍可读时刷新本地副本；原文件丢失则继续使用已有副本
        if (row.origin_path && row.stored_path) {
          await copyFile(row.origin_path, row.stored_path).catch(() => undefined);
        }
        const extracted = await readTextFileOrExtract(sourcePath, MAX_SOURCE_BYTES);
        const next = extracted.output.trim();
        if (next) rawText = next;
      } catch {
        // 原文件不可读时继续使用已有文本
      }
    }
    if (!rawText.trim()) {
      throw new Error('来源文件不可读，无法重新解析');
    }
    this.removeFtsBySource(id);
    this.db.prepare('DELETE FROM knowledge_chunks WHERE source_id = ?').run(id);
    const chunks = chunkKnowledgeText(rawText);
    const now = Date.now();
    this.db.exec('BEGIN');
    try {
      for (const chunk of chunks) {
        const chunkId = randomUUID();
        this.db
          .prepare(
            `INSERT INTO knowledge_chunks
             (id, source_id, ordinal, heading, content, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .run(chunkId, id, chunk.ordinal, chunk.heading ?? null, chunk.content, now);
        this.syncFts(chunkId, id, row.name, chunk.content);
      }
      this.db
        .prepare(
          `UPDATE knowledge_sources
           SET chunk_count = ?, status = ?, error = NULL, bytes = ?, raw_text = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          chunks.length,
          'ready',
          Buffer.byteLength(rawText, 'utf8'),
          sourcePath ? '' : rawText,
          now,
          id
        );
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.find(id);
  }

  /**
   * 将来源标记为异常；重建失败时保留可见错误，并从检索结果中排除。
   */
  markError(id: string, message: string): void {
    this.db
      .prepare('UPDATE knowledge_sources SET status = ?, error = ?, updated_at = ? WHERE id = ?')
      .run('error', message.slice(0, 500), Date.now(), id);
  }

  /**
   * 读取来源文件的本地存储路径；用于打开文件位置。
   */
  storedPath(id: string): string | undefined {
    return this.rowById(id)?.stored_path ?? undefined;
  }

  /**
   * 搜索知识库；FTS5 不可用或短查询时降级为 LIKE。
   */
  search(input: KnowledgeSearchInput): KnowledgeSearchHit[] {
    const parsed = knowledgeSearchInputSchema.parse(input);
    const query = parsed.query.trim();
    const limit = Math.min(parsed.limit ?? MAX_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    if (!query) return [];

    let rows: KnowledgeChunkRow[] = [];
    if (Array.from(query).length >= 3) {
      try {
        rows = this.db
          .prepare(
            `SELECT c.id, c.source_id, c.ordinal, c.heading, c.content,
                    s.name AS source_name, s.origin_path, s.stored_path
             FROM knowledge_fts f
             JOIN knowledge_chunks c ON c.id = f.chunk_id
             JOIN knowledge_sources s ON s.id = c.source_id
             WHERE knowledge_fts MATCH ? AND s.status = 'ready'
             ORDER BY bm25(knowledge_fts)
             LIMIT ?`
          )
          .all(`"${query.replace(/"/g, '""')}"`, limit) as unknown as KnowledgeChunkRow[];
      } catch {
        rows = [];
      }
    }
    if (!rows.length) {
      rows = this.db
        .prepare(
          `SELECT c.id, c.source_id, c.ordinal, c.heading, c.content,
                  s.name AS source_name, s.origin_path, s.stored_path
           FROM knowledge_chunks c
           JOIN knowledge_sources s ON s.id = c.source_id
           WHERE s.status = 'ready'
             AND (c.content LIKE ? ESCAPE '\\' OR COALESCE(c.heading, '') LIKE ? ESCAPE '\\')
           ORDER BY s.updated_at DESC, c.ordinal ASC
           LIMIT ?`
        )
        .all(
          `%${escapeLike(query)}%`,
          `%${escapeLike(query)}%`,
          limit
        ) as unknown as KnowledgeChunkRow[];
    }

    return rows
      .filter((row) => !row.stored_path || existsSync(row.stored_path))
      .map((row) => {
        const snippet = buildSnippet(row.content, query);
        return {
          chunkId: row.id,
          sourceId: row.source_id,
          sourceName: row.source_name,
          ...(row.origin_path ? { originPath: row.origin_path } : {}),
          ...(row.heading ? { heading: row.heading } : {}),
          ...snippet
        };
      });
  }

  /**
   * 重建 FTS 索引；失败时返回 false，主表不受影响。
   */
  rebuildIndex(): boolean {
    try {
      this.db.exec('DELETE FROM knowledge_fts');
      const rows = this.db
        .prepare(
          `SELECT c.id, c.source_id, c.content, s.name AS source_name
           FROM knowledge_chunks c JOIN knowledge_sources s ON s.id = c.source_id`
        )
        .all() as Array<{ id: string; source_id: string; content: string; source_name: string }>;
      for (const row of rows) this.syncFts(row.id, row.source_id, row.source_name, row.content);
      return true;
    } catch {
      return false;
    }
  }
}
