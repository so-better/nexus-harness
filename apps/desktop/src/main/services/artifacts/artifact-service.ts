/**
 * 工具产物存储：把完整输出写入 userData/artifacts，并记录可查询的元数据。
 */

import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, realpath, writeFile } from 'node:fs/promises';
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

/**
 * 产物元信息；不读取文件内容，供列表与卡片轻量展示。
 */
export interface ArtifactMeta {
  artifactId: string;
  label: string;
  bytes: number;
}

interface ArtifactRow {
  id: string;
  label: string;
  path: string;
  bytes: number;
}

/**
 * 分片读取结果；truncated 表示 offset+maxChars 之后仍有内容。
 */
export interface ArtifactSlice {
  artifactId: string;
  label: string;
  bytes: number;
  content: string;
  truncated: boolean;
}

/**
 * 分片读取时的块大小；避免一次性把大产物读入内存。
 */
const READ_CHUNK_BYTES = 64 * 1024;

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
   * 只读取产物元信息，不加载文件内容。
   */
  async meta(sessionId: string, artifactId: string): Promise<ArtifactMeta | undefined> {
    if (!this.db) return undefined;
    const row = this.db
      .prepare('SELECT id, label, bytes FROM artifacts WHERE id = ? AND session_id = ?')
      .get(artifactId, sessionId) as unknown as ArtifactRow | undefined;
    if (!row) return undefined;
    return { artifactId: row.id, label: row.label, bytes: Number(row.bytes) };
  }

  /**
   * 校验会话归属与路径安全，返回真实路径；不读取内容。
   */
  private async resolveArtifact(
    sessionId: string,
    artifactId: string
  ): Promise<{ row: ArtifactRow; realPath: string } | undefined> {
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
      return { row, realPath };
    } catch {
      return undefined;
    }
  }

  /**
   * 按会话与 ID 读取产物全文；路径必须位于 artifacts 根目录内。
   */
  async read(sessionId: string, artifactId: string): Promise<ArtifactContent | undefined> {
    const resolved = await this.resolveArtifact(sessionId, artifactId);
    if (!resolved) return undefined;

    try {
      const content = await readFile(resolved.realPath, 'utf8');
      return {
        artifactId: resolved.row.id,
        label: resolved.row.label,
        bytes: Number(resolved.row.bytes),
        content
      };
    } catch {
      return undefined;
    }
  }

  /**
   * 分片读取产物：按字符偏移流式解码，只读取所需范围，避免把大产物整体载入内存。
   * truncated 为 true 表示 offset + maxChars 之后还有内容。
   */
  async readRange(
    sessionId: string,
    artifactId: string,
    offset: number,
    maxChars: number
  ): Promise<ArtifactSlice | undefined> {
    const resolved = await this.resolveArtifact(sessionId, artifactId);
    if (!resolved) return undefined;

    const handle = await open(resolved.realPath, 'r');
    try {
      const decoder = new TextDecoder('utf-8');
      const buffer = Buffer.alloc(READ_CHUNK_BYTES);
      const needed = offset + maxChars;
      let text = '';
      let position = 0;
      let truncated = false;

      // 需要多读至少一个字符才能判断 end 之后是否还有内容
      for (;;) {
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
        if (bytesRead === 0) {
          text += decoder.decode();
          break;
        }
        position += bytesRead;
        text += decoder.decode(buffer.subarray(0, bytesRead), { stream: true });
        if (text.length > needed) {
          truncated = true;
          break;
        }
      }

      return {
        artifactId: resolved.row.id,
        label: resolved.row.label,
        bytes: Number(resolved.row.bytes),
        content: text.slice(offset, offset + maxChars),
        truncated
      };
    } catch {
      return undefined;
    } finally {
      await handle.close();
    }
  }
}
