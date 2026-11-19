/**
 * 输出文件服务测试：落盘、元数据与另存为。
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../storage/database';
import { FileService } from './file-service';

describe('FileService', () => {
  let root = '';
  let db: DatabaseSync;
  let files: FileService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'nexus-files-'));
    db = createDatabase(join(root, 'nexus.db'));
    files = new FileService(db, join(root, 'output'));
  });

  afterEach(async () => {
    db.close();
    await rm(root, { recursive: true, force: true });
  });

  it('saves a generated file', async () => {
    const file = await files.save({
      sessionId: 'session-1',
      runId: 'run-1',
      name: 'report.md',
      content: '# 报告'
    });

    expect(file).toMatchObject({ name: 'report.md', mime: 'text/markdown', source: 'generated' });
  });

  it('copies a file to a user-selected path', async () => {
    const file = await files.save({
      sessionId: 'session-1',
      name: 'output.txt',
      content: 'hello'
    });
    const target = join(root, 'copy.txt');
    await files.saveAs(file.id, 'session-1', target);

    expect(await readFile(target, 'utf8')).toBe('hello');
  });

  it('stores exports under the exports directory', async () => {
    const file = await files.saveExport({
      sessionId: 'session-1',
      name: 'session.md',
      content: '# Export'
    });
    const target = join(root, 'export-copy.md');
    await files.saveAs(file.id, 'session-1', target);
    expect(await readFile(target, 'utf8')).toBe('# Export');
    const row = db.prepare('SELECT stored_path FROM files WHERE id = ?').get(file.id) as {
      stored_path: string;
    };
    expect(row.stored_path).toContain('/exports/session-1/');
  });
});
