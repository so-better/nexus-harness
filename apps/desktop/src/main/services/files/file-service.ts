/**
 * AI 输出文件服务：写入 userData/files，记录元数据并支持另存为。
 */

import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { FileReadResult, OutputFile } from '@shared/ipc/contracts';
import { getAppDataPaths } from '../storage/paths';

interface FileRow {
  id: string;
  session_id: string;
  run_id: string | null;
  name: string;
  mime: string;
  bytes: number;
  source: string;
  stored_path: string;
  created_at: number;
}

export interface SaveFileInput {
  sessionId: string;
  runId?: string;
  name: string;
  mime?: string;
  content: string | Uint8Array;
  source?: 'generated' | 'downloaded';
}

const toOutputFile = (row: FileRow): OutputFile => ({
  id: row.id,
  sessionId: row.session_id,
  ...(row.run_id ? { runId: row.run_id } : {}),
  name: row.name,
  mime: row.mime,
  bytes: Number(row.bytes),
  source: row.source === 'downloaded' ? 'downloaded' : 'generated',
  createdAt: Number(row.created_at)
});

const mimeForName = (name: string): string => {
  switch (extname(name).toLowerCase()) {
    case '.md':
      return 'text/markdown';
    case '.json':
      return 'application/json';
    case '.csv':
      return 'text/csv';
    case '.html':
      return 'text/html';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.pdf':
      return 'application/pdf';
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case '.xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case '.pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    default:
      return 'text/plain';
  }
};

const safeName = (name: string): string => {
  const cleaned = name
    .replace(/[\\/:*?"<>|\0]/g, '_')
    .trim()
    .slice(0, 120);
  return cleaned || 'output.txt';
};

/**
 * 文件元数据与磁盘内容统一由本服务管理。
 */
export class FileService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly baseDir?: string
  ) {}

  private get directory(): string {
    return this.baseDir ?? getAppDataPaths().files;
  }

  private get(fileId: string, sessionId: string): (FileRow & { stored_path: string }) | undefined {
    return this.db
      .prepare('SELECT * FROM files WHERE id = ? AND session_id = ?')
      .get(fileId, sessionId) as FileRow | undefined;
  }

  /**
   * 保存生成或下载的文件，返回可被 UI 引用的元数据。
   */
  async save(input: SaveFileInput): Promise<OutputFile> {
    return this.saveInDirectory(input, join(this.directory, input.sessionId));
  }

  /**
   * 保存会话导出文件到 files/exports，保持导出内容与普通输出文件隔离。
   */
  async saveExport(input: SaveFileInput): Promise<OutputFile> {
    return this.saveInDirectory(input, join(this.directory, 'exports', input.sessionId));
  }

  private async saveInDirectory(input: SaveFileInput, directory: string): Promise<OutputFile> {
    const id = randomUUID();
    const name = safeName(input.name);
    await mkdir(directory, { recursive: true });
    const storedPath = join(directory, `${id}-${name}`);
    const data =
      typeof input.content === 'string' ? Buffer.from(input.content, 'utf8') : input.content;
    await writeFile(storedPath, data);
    const createdAt = Date.now();
    const mime = input.mime ?? mimeForName(name);
    const source = input.source ?? 'generated';

    this.db
      .prepare(
        `INSERT INTO files
          (id, session_id, run_id, name, mime, bytes, source, stored_path, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.sessionId,
        input.runId ?? null,
        name,
        mime,
        data.byteLength,
        source,
        storedPath,
        createdAt
      );

    return {
      id,
      sessionId: input.sessionId,
      ...(input.runId ? { runId: input.runId } : {}),
      name,
      mime,
      bytes: data.byteLength,
      source,
      createdAt
    };
  }

  /**
   * 把文件复制到用户选择的位置。
   */
  async saveAs(fileId: string, sessionId: string, targetPath: string): Promise<string> {
    const row = this.get(fileId, sessionId);
    if (!row) throw new Error('文件不存在');
    await mkdir(dirname(targetPath), { recursive: true });
    await copyFile(row.stored_path, targetPath);
    return targetPath;
  }

  /**
   * 获取文件元数据，供保存对话框默认文件名使用。
   */
  getMeta(fileId: string, sessionId: string): OutputFile | undefined {
    const row = this.get(fileId, sessionId);
    return row ? toOutputFile(row) : undefined;
  }

  /**
   * 读取输出文件内容；仅供渲染层预览，路径完全由主进程解析。
   */
  async read(fileId: string, sessionId: string, maxBytes = 20_000_000): Promise<FileReadResult> {
    const row = this.get(fileId, sessionId);
    if (!row) throw new Error('文件不存在');
    if (Number(row.bytes) > maxBytes) throw new Error('文件超过预览大小上限');
    const data = await readFile(row.stored_path);
    return {
      fileId: row.id,
      name: row.name,
      mime: row.mime,
      bytes: Number(row.bytes),
      base64: data.toString('base64')
    };
  }
}
