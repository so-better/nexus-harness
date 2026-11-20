/**
 * 用户附件：保存粘贴、拖拽或选择的文件，内容独立于 AI 输出文件。
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { MessageAttachment } from '@shared/events';
import { getAppDataPaths } from '../storage/paths';

interface AttachmentRow {
  id: string;
  session_id: string;
  name: string;
  mime: string;
  bytes: number;
  stored_path: string;
  created_at: number;
}

const safeName = (name: string): string => {
  const cleaned = name
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, '_')
    .trim()
    .slice(0, 180);
  return cleaned || 'attachment';
};

const toAttachment = (row: AttachmentRow): MessageAttachment => ({
  id: row.id,
  sessionId: row.session_id,
  name: row.name,
  mime: row.mime,
  bytes: Number(row.bytes),
  createdAt: Number(row.created_at)
});

export interface SaveAttachmentInput {
  sessionId: string;
  name: string;
  mime: string;
  content: Uint8Array;
}

export class AttachmentService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly baseDir?: string
  ) {}

  private get directory(): string {
    return this.baseDir ?? getAppDataPaths().attachments;
  }

  private getRow(id: string, sessionId: string): AttachmentRow | undefined {
    return this.db
      .prepare('SELECT * FROM attachments WHERE id = ? AND session_id = ?')
      .get(id, sessionId) as AttachmentRow | undefined;
  }

  async save(input: SaveAttachmentInput): Promise<MessageAttachment> {
    const id = randomUUID();
    const name = safeName(input.name);
    const directory = join(this.directory, input.sessionId);
    await mkdir(directory, { recursive: true });
    const storedPath = join(directory, `${id}-${name}`);
    await writeFile(storedPath, input.content);
    const createdAt = Date.now();
    try {
      this.db
        .prepare(
          `INSERT INTO attachments (id, session_id, name, mime, bytes, stored_path, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(id, input.sessionId, name, input.mime, input.content.byteLength, storedPath, createdAt);
    } catch (error) {
      // 数据库失败时回滚已写入的文件，避免留下不可追踪的孤儿附件
      await rm(storedPath, { force: true }).catch(() => undefined);
      throw error;
    }
    return {
      id,
      sessionId: input.sessionId,
      name,
      mime: input.mime,
      bytes: input.content.byteLength,
      createdAt
    };
  }

  get(id: string, sessionId: string): MessageAttachment | undefined {
    const row = this.getRow(id, sessionId);
    return row ? toAttachment(row) : undefined;
  }

  getStoredPath(id: string, sessionId: string): string | undefined {
    return this.getRow(id, sessionId)?.stored_path;
  }

  async read(
    id: string,
    sessionId: string
  ): Promise<{ attachment: MessageAttachment; base64: string } | undefined> {
    const row = this.getRow(id, sessionId);
    if (!row) return undefined;
    return {
      attachment: toAttachment(row),
      base64: (await readFile(row.stored_path)).toString('base64')
    };
  }

  async remove(id: string, sessionId: string): Promise<boolean> {
    const row = this.getRow(id, sessionId);
    if (!row) return false;
    await rm(row.stored_path, { force: true });
    this.db.prepare('DELETE FROM attachments WHERE id = ? AND session_id = ?').run(id, sessionId);
    return true;
  }
  /**
   * 删除会话的全部附件文件和元数据；用于会话删除后的存储清理。
   */
  async removeBySession(sessionId: string): Promise<number> {
    const rows = this.db
      .prepare('SELECT stored_path FROM attachments WHERE session_id = ?')
      .all(sessionId) as Array<{ stored_path: string }>;
    await Promise.all(
      rows.map((row) => rm(row.stored_path, { force: true }).catch(() => undefined))
    );
    await rm(join(this.directory, sessionId), { recursive: true, force: true }).catch(
      () => undefined
    );
    this.db.prepare('DELETE FROM attachments WHERE session_id = ?').run(sessionId);
    return rows.length;
  }
}
