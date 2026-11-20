/**
 * 数据迁移备份：校验导出、暂存与启动恢复，不触碰真实 userData。
 */
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import AdmZip from 'adm-zip';
import { createDatabase } from '../storage/database';
import { DatabaseSync } from 'node:sqlite';
import type { AppDataPaths } from '../storage/paths';
import { applyPendingRestore, createBackup, stageBackup } from './backup-service';

describe('backup service', () => {
  let root = '';
  let paths: AppDataPaths;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'nexus-backup-test-'));
    paths = {
      root,
      plugins: join(root, 'plugins'),
      skills: join(root, 'skills'),
      mcp: join(root, 'mcp'),
      settings: join(root, 'settings'),
      files: join(root, 'files'),
      artifacts: join(root, 'artifacts'),
      checkpoints: join(root, 'checkpoints'),
      logs: join(root, 'logs')
    };
    await mkdir(paths.settings, { recursive: true });
    await writeFile(join(paths.settings, 'language.json'), '{"language":"zh-CN"}', 'utf8');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('exports a manifest and data, then restores it on startup', async () => {
    const db = createDatabase(join(root, 'nexus.db'));
    const exportParent = await mkdtemp(join(tmpdir(), 'nexus-backup-out-'));
    const exported = await createBackup(db, join(exportParent, 'backup.zip'), paths);
    db.close();

    const archive = new AdmZip(exported.path);
    expect(JSON.parse(archive.readAsText('nexus-backup.json'))).toMatchObject({
      format: 'nexus-backup',
      version: 1
    });
    expect(archive.getEntry('nexus.db')).toBeDefined();
    expect((await stat(exported.path)).isFile()).toBe(true);
    await stageBackup(exported.path, paths);

    await writeFile(join(paths.settings, 'language.json'), '{"language":"en-US"}', 'utf8');
    await applyPendingRestore(paths);

    expect(await readFile(join(paths.settings, 'language.json'), 'utf8')).toContain('zh-CN');
    await expect(stat(join(root, '.restore-staging'))).rejects.toThrow();
    await rm(exportParent, { recursive: true, force: true });
  });

  it('rebases output paths when restoring into a different userData root', async () => {
    const sourcePaths = { ...paths, root };
    await mkdir(join(root, 'files', 'session-1'), { recursive: true });
    const filePath = join(root, 'files', 'session-1', 'output.txt');
    await writeFile(filePath, 'content', 'utf8');
    const db = createDatabase(join(root, 'nexus.db'));
    db.prepare(
      `INSERT INTO files (id, session_id, name, mime, bytes, source, stored_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('file-1', 'session-1', 'output.txt', 'text/plain', 7, 'generated', filePath, Date.now());
    const exportParent = await mkdtemp(join(tmpdir(), 'nexus-backup-out-'));
    const exported = await createBackup(db, join(exportParent, 'backup.zip'), sourcePaths);
    db.close();

    const targetRoot = await mkdtemp(join(tmpdir(), 'nexus-backup-target-'));
    const targetPaths: AppDataPaths = {
      ...sourcePaths,
      root: targetRoot,
      files: join(targetRoot, 'files'),
      artifacts: join(targetRoot, 'artifacts'),
      settings: join(targetRoot, 'settings'),
      checkpoints: join(targetRoot, 'checkpoints'),
      plugins: join(targetRoot, 'plugins'),
      skills: join(targetRoot, 'skills'),
      mcp: join(targetRoot, 'mcp'),
      logs: join(targetRoot, 'logs')
    };
    await stageBackup(exported.path, targetPaths);
    await applyPendingRestore(targetPaths);

    const restoredDb = new DatabaseSync(join(targetRoot, 'nexus.db'));
    const row = restoredDb
      .prepare('SELECT stored_path FROM files WHERE id = ?')
      .get('file-1') as { stored_path: string };
    restoredDb.close();
    expect(row.stored_path).toBe(join(targetRoot, 'files', 'session-1', 'output.txt'));
    await rm(exportParent, { recursive: true, force: true });
    await rm(targetRoot, { recursive: true, force: true });
  });

  it('rolls back a restore interrupted after moving old data', async () => {
    await mkdir(join(root, '.restore-previous', 'settings'), { recursive: true });
    await writeFile(
      join(root, '.restore-previous', 'settings', 'language.json'),
      '{"language":"zh-CN"}',
      'utf8'
    );
    await writeFile(join(paths.settings, 'language.json'), '{"language":"en-US"}', 'utf8');
    await writeFile(
      join(root, '.restore-journal.json'),
      JSON.stringify({
        entries: ['settings'],
        moved: ['settings'],
        installed: [],
        phase: 'staging'
      }),
      'utf8'
    );
    await mkdir(join(root, '.restore-staging'), { recursive: true });

    await applyPendingRestore(paths);

    expect(await readFile(join(paths.settings, 'language.json'), 'utf8')).toContain('zh-CN');
    await expect(stat(join(root, '.restore-previous'))).rejects.toThrow();
    await expect(stat(join(root, '.restore-staging'))).rejects.toThrow();
  });

  it('rejects backup sources inside the application data directory', async () => {
    const source = join(root, 'backup.zip');
    const archive = new AdmZip();
    archive.addFile('nexus-backup.json', Buffer.from(JSON.stringify({ format: 'nexus-backup', version: 1 })));
    archive.addFile('nexus.db', Buffer.from('db'));
    await archive.writeZipPromise(source);

    await expect(stageBackup(source, paths)).rejects.toThrow('不能导入应用数据目录内部的备份');
  });

});
