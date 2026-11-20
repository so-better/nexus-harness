/**
 * 数据迁移备份：打包 userData 中的核心数据目录与数据库，导入时先暂存，重启后替换。
 */

import { mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import AdmZip from 'adm-zip';
import type { AppDataPaths } from '../storage/paths';

const BACKUP_FORMAT = 'nexus-backup';
const BACKUP_VERSION = 1;
const MANIFEST_NAME = 'nexus-backup.json';
const STAGING_NAME = '.restore-staging';
const PREVIOUS_NAME = '.restore-previous';
const JOURNAL_NAME = '.restore-journal.json';
const BACKUP_STATE_FILE = 'backup.json';
const BACKUP_DIRECTORIES = [
  'settings',
  'skills',
  'mcp',
  'plugins',
  'files',
  'artifacts',
  'checkpoints'
] as const;
const DATABASE_FILE = 'nexus.db';
const MAX_BACKUP_ENTRIES = 50_000;
const MAX_UNCOMPRESSED_BYTES = 5 * 1024 * 1024 * 1024;

interface RestoreJournal {
  entries: string[];
  moved: string[];
  installed: string[];
  phase: 'staging' | 'completed';
}

interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  createdAt: string;
  sourceRoot?: string;
}

export interface BackupResult {
  path: string;
}

export interface BackupStatus {
  pendingRestore: boolean;
  lastExportPath?: string;
}

const exists = async (path: string): Promise<boolean> =>
  stat(path)
    .then(() => true)
    .catch(() => false);

const isInside = (parent: string, child: string): boolean =>
  child === parent || child.startsWith(`${parent}${sep}`);

const readBackupState = async (paths: AppDataPaths): Promise<{ lastExportPath?: string }> => {
  try {
    const raw = await readFile(join(paths.settings, BACKUP_STATE_FILE), 'utf8');
    const value = JSON.parse(raw) as { lastExportPath?: unknown };
    return typeof value.lastExportPath === 'string' ? { lastExportPath: value.lastExportPath } : {};
  } catch {
    return {};
  }
};

const saveBackupState = async (paths: AppDataPaths, lastExportPath: string): Promise<void> => {
  await mkdir(paths.settings, { recursive: true });
  await writeFile(
    join(paths.settings, BACKUP_STATE_FILE),
    `${JSON.stringify({ lastExportPath }, null, 2)}\n`,
    'utf8'
  );
};

/** 查询是否有等待重启后应用的恢复备份及最近导出路径。 */
export const getBackupStatus = async (paths: AppDataPaths): Promise<BackupStatus> => ({
  pendingRestore: await exists(join(paths.root, STAGING_NAME, MANIFEST_NAME)),
  ...(await readBackupState(paths))
});

/**
 * 导出完整数据为 zip 备份；数据库先 checkpoint，避免 WAL 未落盘。
 */
export const createBackup = async (
  db: DatabaseSync,
  destinationFile: string,
  paths: AppDataPaths
): Promise<BackupResult> => {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const archive = new AdmZip();
    archive.addLocalFile(join(paths.root, DATABASE_FILE));
    for (const directory of BACKUP_DIRECTORIES) {
      const directoryPath = join(paths.root, directory);
      if (await exists(directoryPath)) archive.addLocalFolder(directoryPath, directory);
    }

    const manifest: BackupManifest = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      sourceRoot: paths.root
    };
    archive.addFile(MANIFEST_NAME, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'));
    await archive.writeZipPromise(destinationFile);
    await saveBackupState(paths, destinationFile);
    return { path: destinationFile };
  } catch (error) {
    await rm(destinationFile, { force: true });
    throw error;
  }
};

/**
 * 校验 zip 备份并安全解压到 userData 的暂存区；真正替换发生在下次启动。
 */
export const stageBackup = async (
  sourceFile: string,
  paths: AppDataPaths
): Promise<BackupResult> => {
  const source = await realpath(sourceFile).catch(() => sourceFile);
  const root = await realpath(paths.root).catch(() => paths.root);
  if (isInside(root, source)) throw new Error('不能导入应用数据目录内部的备份');

  const info = await stat(source).catch(() => undefined);
  if (!info?.isFile()) throw new Error('备份文件不存在或不是 zip 文件');

  let archive: AdmZip;
  try {
    archive = new AdmZip(source);
  } catch {
    throw new Error('备份文件不是有效的 zip 压缩包');
  }

  const entries = archive.getEntries();
  if (entries.length > MAX_BACKUP_ENTRIES) throw new Error('备份文件条目过多');
  let uncompressedBytes = 0;
  const names = new Set<string>();
  for (const entry of entries) {
    const name = entry.entryName.replace(/\\/g, '/');
    const segments = name.split('/');
    if (
      !name ||
      name.startsWith('/') ||
      /^[a-zA-Z]:/.test(name) ||
      segments.includes('..') ||
      name.includes('\0')
    ) {
      throw new Error('备份文件包含非法路径');
    }
    const mode = (entry.header.attr >>> 16) & 0o170000;
    if (mode === 0o120000) throw new Error('备份文件不能包含符号链接');
    names.add(name);
    uncompressedBytes += entry.header.size;
    if (uncompressedBytes > MAX_UNCOMPRESSED_BYTES) throw new Error('备份文件解压后过大');
  }
  if (!names.has(MANIFEST_NAME) || !names.has(DATABASE_FILE)) {
    throw new Error('备份缺少清单或数据库文件');
  }

  const staging = join(paths.root, STAGING_NAME);
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  try {
    await archive.extractAllToAsync(staging, true);
    const manifestText = await readFile(join(staging, MANIFEST_NAME), 'utf8');
    const manifest = JSON.parse(manifestText) as Partial<BackupManifest>;
    if (manifest.format !== BACKUP_FORMAT || manifest.version !== BACKUP_VERSION) {
      throw new Error('备份文件格式或版本不受支持');
    }
    if (!(await exists(join(staging, DATABASE_FILE)))) throw new Error('备份缺少数据库文件');
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  return { path: staging };
};

const rebasePath = (value: string, sourceRoot: string | undefined, targetRoot: string): string => {
  if (!sourceRoot || !value.startsWith(`${sourceRoot}${sep}`)) return value;
  return join(targetRoot, value.slice(sourceRoot.length + 1));
};

/**
 * 迁移文件与产物元数据中的绝对路径，支持换一台机器恢复。
 */
const rebaseDatabasePaths = (databasePath: string, sourceRoot: string | undefined, targetRoot: string): void => {
  if (!sourceRoot || sourceRoot === targetRoot) return;
  const db = new DatabaseSync(databasePath);
  try {
    const files = db.prepare('SELECT id, stored_path FROM files').all() as Array<{
      id: string;
      stored_path: string;
    }>;
    const updateFile = db.prepare('UPDATE files SET stored_path = ? WHERE id = ?');
    for (const file of files) {
      updateFile.run(rebasePath(file.stored_path, sourceRoot, targetRoot), file.id);
    }
    const artifacts = db.prepare('SELECT id, path FROM artifacts').all() as Array<{
      id: string;
      path: string;
    }>;
    const updateArtifact = db.prepare('UPDATE artifacts SET path = ? WHERE id = ?');
    for (const artifact of artifacts) {
      updateArtifact.run(rebasePath(artifact.path, sourceRoot, targetRoot), artifact.id);
    }
  } finally {
    db.close();
  }
};

/**
 * 读取并写入恢复日志；日志在每一步 rename 前后用于崩溃恢复。
 */
const readJournal = async (root: string): Promise<RestoreJournal | undefined> => {
  try {
    const raw = await readFile(join(root, JOURNAL_NAME), 'utf8');
    return JSON.parse(raw) as RestoreJournal;
  } catch {
    return undefined;
  }
};

const writeJournal = async (root: string, journal: RestoreJournal): Promise<void> => {
  await writeFile(join(root, JOURNAL_NAME), `${JSON.stringify(journal, null, 2)}\n`, 'utf8');
};

/**
 * 启动时处理上次恢复中断：未完成则回滚旧数据，已完成则清理残留。
 */
const recoverInterruptedRestore = async (paths: AppDataPaths): Promise<void> => {
  const previous = join(paths.root, PREVIOUS_NAME);
  const staging = join(paths.root, STAGING_NAME);
  const journal = await readJournal(paths.root);
  if (!(await exists(previous))) {
    if (journal) await rm(join(paths.root, JOURNAL_NAME), { force: true });
    return;
  }

  if (journal?.phase === 'completed') {
    await rm(previous, { recursive: true, force: true });
    await rm(staging, { recursive: true, force: true });
    await rm(join(paths.root, JOURNAL_NAME), { force: true });
    return;
  }

  const moved = journal?.moved ?? (await readdir(previous));
  const installed = journal?.installed ?? [];
  if (moved.length === 0 && installed.length === 0) {
    // 尚未移动任何数据，保留 staging 供下一次启动继续恢复
    await rm(previous, { recursive: true, force: true });
    await rm(join(paths.root, JOURNAL_NAME), { force: true });
    return;
  }
  for (const name of installed.reverse()) {
    await rm(join(paths.root, name), { recursive: true, force: true });
  }
  for (const name of moved.reverse()) {
    const oldPath = join(previous, name);
    if (!(await exists(oldPath))) continue;
    await rm(join(paths.root, name), { recursive: true, force: true });
    await rename(oldPath, join(paths.root, name));
  }
  await rm(previous, { recursive: true, force: true });
  await rm(staging, { recursive: true, force: true });
  await rm(join(paths.root, JOURNAL_NAME), { force: true });
};

/**
 * 应用暂存备份；必须在数据库初始化前调用，失败时保留暂存目录供诊断。
 */
export const applyPendingRestore = async (paths: AppDataPaths): Promise<boolean> => {
  try {
    await recoverInterruptedRestore(paths);
  } catch (error) {
    console.error('恢复中断状态失败', error);
    return false;
  }

  const staging = join(paths.root, STAGING_NAME);
  if (!(await exists(join(staging, MANIFEST_NAME)))) return false;

  try {
    const manifest = JSON.parse(
      await readFile(join(staging, MANIFEST_NAME), 'utf8')
    ) as BackupManifest;
    const entries = (await readdir(staging, { withFileTypes: true })).filter(
      (entry) => entry.name !== MANIFEST_NAME
    );
    const previous = join(paths.root, PREVIOUS_NAME);
    await rm(previous, { recursive: true, force: true });
    await mkdir(previous, { recursive: true });

    const journal: RestoreJournal = {
      entries: entries.map((entry) => entry.name),
      moved: [],
      installed: [],
      phase: 'staging'
    };
    await writeJournal(paths.root, journal);

    try {
      for (const entry of entries) {
        const target = join(paths.root, entry.name);
        if (!(await exists(target))) continue;
        journal.moved.push(entry.name);
        await writeJournal(paths.root, journal);
        await rename(target, join(previous, entry.name));
      }
      for (const entry of entries) {
        journal.installed.push(entry.name);
        await writeJournal(paths.root, journal);
        await rename(join(staging, entry.name), join(paths.root, entry.name));
      }
      await rm(join(paths.root, `${DATABASE_FILE}-wal`), { force: true });
      await rm(join(paths.root, `${DATABASE_FILE}-shm`), { force: true });
      rebaseDatabasePaths(join(paths.root, DATABASE_FILE), manifest.sourceRoot, paths.root);
      journal.phase = 'completed';
      await writeJournal(paths.root, journal);
    } catch (error) {
      for (const name of journal.installed.reverse()) {
        await rm(join(paths.root, name), { recursive: true, force: true });
      }
      for (const name of journal.moved.reverse()) {
        await rename(join(previous, name), join(paths.root, name));
      }
      await rm(previous, { recursive: true, force: true });
      await rm(join(paths.root, JOURNAL_NAME), { force: true });
      throw error;
    }

    await rm(previous, { recursive: true, force: true });
    await rm(staging, { recursive: true, force: true });
    await rm(join(paths.root, JOURNAL_NAME), { force: true });
    return true;
  } catch (error) {
    console.error('恢复备份失败', error);
    return false;
  }
};
