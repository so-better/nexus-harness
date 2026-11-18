/**
 * 工具产物存储：把完整输出写入 userData/artifacts，并记录可查询的元数据。
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { getAppDataPaths } from '../storage/paths';

/**
 * 单个 artifact 上限，避免一次写入撑爆磁盘。
 */
const MAX_ARTIFACT_BYTES = 10_000_000;
/**
 * 文件路径片段只允许安全字符，防止路径穿越。
 */
const SAFE_SEGMENT = /[^a-zA-Z0-9_-]/g;

/**
 * 已落盘的产物引用；path 仅供主进程使用，不直接暴露给渲染层。
 */
export interface StoredArtifact {
  artifactId: string;
  path: string;
  bytes: number;
}

/**
 * 供渲染层读取的产物内容；路径不对外暴露。
 */
export interface ArtifactContent {
  artifactId: string;
  label: string;
  bytes: number;
  content: string;
}

interface ArtifactRow {
  id: string;
  label: string;
  path: string;
  bytes: number;
}

/**
 * 把会话内的长文本保存为 artifact；baseDir/db 可注入用于测试。
 */
export class ArtifactService {
  constructor(
    private readonly baseDir?: string,
    private readonly db?: DatabaseSync
  ) {}

  private get root(): string {
    return this.baseDir ?? getAppDataPaths().artifacts;
  }

  /**
   * 保存文本产物并写入索引；sessionId 会被净化，避免路径穿越。
   */
  async saveText(
    sessionId: string,
    label: string,
    content: string,
    options: { runId?: string } = {}
  ): Promise<StoredArtifact> {
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > MAX_ARTIFACT_BYTES) throw new Error('ARTIFACT_TOO_LARGE');

    const safeSession = sessionId.replace(SAFE_SEGMENT, '_');
    const safeLabel = label.replace(SAFE_SEGMENT, '_').slice(0, 48) || 'output';
    const directory = join(this.root, safeSession);
    await mkdir(directory, { recursive: true });

    const artifactId = randomUUID();
    const path = join(directory, `${safeLabel}-${artifactId}.txt`);
    await writeFile(path, content, 'utf8');

    this.db
      ?.prepare(
        `INSERT INTO artifacts (id, session_id, run_id, label, path, bytes, mime, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        artifactId,
        sessionId,
        options.runId ?? null,
        safeLabel,
        path,
        bytes,
        'text/plain',
        Date.now()
      );

    return { artifactId, path, bytes };
  }

  /**
   * 按会话与 ID 读取产物；路径必须位于 artifacts 根目录内。
   */
  async read(sessionId: string, artifactId: string): Promise<ArtifactContent | undefined> {
    if (!this.db) return undefined;

    const row = this.db
      .prepare('SELECT id, label, path, bytes FROM artifacts WHERE id = ? AND session_id = ?')
      .get(artifactId, sessionId) as unknown as ArtifactRow | undefined;
    if (!row) return undefined;

    const root = resolve(this.root);
    const path = resolve(row.path);
    if (path !== root && !path.startsWith(`${root}${sep}`)) return undefined;

    try {
      const realRoot = await realpath(root);
      const realPath = await realpath(path);
      if (realPath !== realRoot && !realPath.startsWith(`${realRoot}${sep}`)) return undefined;

      const content = await readFile(realPath, 'utf8');
      return {
        artifactId: row.id,
        label: row.label,
        bytes: Number(row.bytes),
        content
      };
    } catch {
      return undefined;
    }
  }
}
