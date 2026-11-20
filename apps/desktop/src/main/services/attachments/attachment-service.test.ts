// @vitest-environment node
/**
 * 附件服务：保存、读取、路径隔离与移除。
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AttachmentService } from './attachment-service';

describe('AttachmentService', () => {
  let db: DatabaseSync;
  let baseDir: string;
  let service: AttachmentService;

  beforeEach(async () => {
    db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE sessions (id TEXT PRIMARY KEY, deleted_at INTEGER);
      CREATE TABLE attachments (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        name TEXT NOT NULL,
        mime TEXT NOT NULL,
        bytes INTEGER NOT NULL,
        stored_path TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
    db.prepare('INSERT INTO sessions (id) VALUES (?)').run('session-a');
    db.prepare('INSERT INTO sessions (id) VALUES (?)').run('session-b');
    baseDir = await mkdtemp(join(tmpdir(), 'nexus-attachments-'));
    service = new AttachmentService(db, baseDir);
  });

  afterEach(async () => {
    db.close();
    await rm(baseDir, { recursive: true, force: true });
  });

  it('persists content and supports scoped reads', async () => {
    const attachment = await service.save({
      sessionId: 'session-a',
      name: '../notes\n.txt',
      mime: 'text/plain',
      content: Buffer.from('hello attachment')
    });

    expect(attachment.name).toBe('.._notes_.txt');
    expect(attachment.bytes).toBe(16);
    expect(service.get(attachment.id, 'session-a')?.name).toBe('.._notes_.txt');
    expect(service.get(attachment.id, 'session-b')).toBeUndefined();

    const stored = await service.read(attachment.id, 'session-a');
    expect(Buffer.from(stored?.base64 ?? '', 'base64').toString()).toBe('hello attachment');
    const path = service.getStoredPath(attachment.id, 'session-a');
    expect(path).toBeTruthy();
    expect((await readFile(path!)).toString()).toBe('hello attachment');
  });

  it('removes metadata and stored content', async () => {
    const attachment = await service.save({
      sessionId: 'session-a',
      name: 'report.pdf',
      mime: 'application/pdf',
      content: Buffer.from('pdf')
    });
    const path = service.getStoredPath(attachment.id, 'session-a');

    await expect(service.remove(attachment.id, 'session-a')).resolves.toBe(true);
    expect(service.get(attachment.id, 'session-a')).toBeUndefined();
    await expect(readFile(path!)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('removes all attachments for a session', async () => {
    const first = await service.save({
      sessionId: 'session-a',
      name: 'one.txt',
      mime: 'text/plain',
      content: Buffer.from('one')
    });
    const second = await service.save({
      sessionId: 'session-a',
      name: 'two.png',
      mime: 'image/png',
      content: Buffer.from('two')
    });
    const firstPath = service.getStoredPath(first.id, 'session-a');
    const secondPath = service.getStoredPath(second.id, 'session-a');

    await expect(service.removeBySession('session-a')).resolves.toBe(2);
    expect(service.get(first.id, 'session-a')).toBeUndefined();
    expect(service.get(second.id, 'session-a')).toBeUndefined();
    await expect(readFile(firstPath!)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(secondPath!)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
