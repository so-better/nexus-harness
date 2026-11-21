/**
 * 迁移备份工具：导出、查询状态与暂存导入；恢复仍需重启应用。
 */
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { app } from 'electron';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type { AgentToolDefinition, ToolExecutionResult } from '@nexus/core';
import type { AppDataPaths } from '../storage/paths';
import { getAppDataPaths } from '../storage/paths';
import { createBackup, getBackupStatus, stageBackup } from '../settings/backup-service';
import { hasOtherActiveRuns } from './run-registry';

export interface BackupToolOptions {
  paths?: AppDataPaths;
  database?: DatabaseSync;
  runId?: string;
}

const backupExportSchema = z.object({ path: z.string().min(1).optional() }).strict();
const backupImportSchema = z.object({ path: z.string().min(1) }).strict();
const backupStatusSchema = z.object({}).strict();

const tool = (
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
  requiresApproval: boolean
): AgentToolDefinition => ({
  name,
  description,
  permission: requiresApproval ? 'write' : 'read',
  requiresApproval,
  inputSchema: { type: 'object', properties, required, additionalProperties: false }
});

export const backupToolDefinitions: AgentToolDefinition[] = [
  tool('backup_status', '读取是否有等待重启恢复的备份，以及最近导出路径。', {}, [], false),
  tool(
    'backup_export',
    '导出完整数据备份；默认保存到系统下载目录；相对路径按下载目录解析，也可指定绝对路径。',
    { path: { type: 'string' } },
    [],
    true
  ),
  tool(
    'backup_import',
    '校验并暂存备份文件，下一次启动时恢复；相对路径按下载目录解析，需要重启。',
    { path: { type: 'string' } },
    ['path'],
    true
  )
];

const success = (value: unknown): ToolExecutionResult => ({
  ok: true,
  output: JSON.stringify(value)
});

const failure = (code: string, message: string): ToolExecutionResult => ({
  ok: false,
  output: '',
  error: { code, message }
});

const isInside = (parent: string, child: string): boolean => {
  const root = resolve(parent);
  const target = resolve(child);
  return target === root || target.startsWith(`${root}${sep}`);
};

const defaultBackupPath = (): string =>
  join(app.getPath('downloads'), `nexus-backup-${new Date().toISOString().slice(0, 10)}.zip`);

/**
 * 执行备份工具；导入只暂存，不热替换正在运行的数据库。
 */
export const executeBackupTool = async (
  name: string,
  input: unknown,
  options: BackupToolOptions = {}
): Promise<ToolExecutionResult> => {
  const paths = options.paths ?? getAppDataPaths();

  if (name === 'backup_status') {
    if (!backupStatusSchema.safeParse(input).success) {
      return failure('BACKUP_INVALID_INPUT', '参数不合法');
    }
    return success(await getBackupStatus(paths));
  }

  if (name === 'backup_export') {
    const parsed = backupExportSchema.safeParse(input);
    if (!parsed.success) return failure('BACKUP_INVALID_INPUT', '备份参数不合法');
    if (!options.database) return failure('BACKUP_DATABASE_UNAVAILABLE', '数据库未初始化');
    if (hasOtherActiveRuns(options.runId)) {
      return failure('BACKUP_BUSY', '有其他人任务正在运行，暂不能导出');
    }
    const destination = parsed.data.path
      ? isAbsolute(parsed.data.path)
        ? parsed.data.path
        : join(app.getPath('downloads'), parsed.data.path)
      : defaultBackupPath();
    const target = destination.toLowerCase().endsWith('.zip') ? destination : `${destination}.zip`;
    if (isInside(paths.root, target)) {
      return failure('BACKUP_INVALID_PATH', '备份文件不能写入应用数据目录');
    }
    let snapshotDir: string | undefined;
    try {
      await mkdir(dirname(target), { recursive: true });
      // 使用 SQLite 一致性快照，允许当前 Run 导出而不直接复制正在写入的数据库
      snapshotDir = await mkdtemp(join(tmpdir(), 'nexus-backup-snapshot-'));
      const snapshot = join(snapshotDir, 'nexus.db');
      const escaped = snapshot.replace(/'/g, "''");
      options.database.exec(`VACUUM INTO '${escaped}'`);
      return success(await createBackup(options.database, target, paths, snapshot));
    } catch (error) {
      return failure('BACKUP_EXPORT_FAILED', error instanceof Error ? error.message : '导出失败');
    } finally {
      if (snapshotDir) await rm(snapshotDir, { recursive: true, force: true });
    }
  }

  if (name === 'backup_import') {
    const parsed = backupImportSchema.safeParse(input);
    if (!parsed.success) return failure('BACKUP_INVALID_INPUT', '备份路径不合法');
    if (hasOtherActiveRuns(options.runId)) {
      return failure('BACKUP_BUSY', '有其他人任务正在运行，暂不能导入');
    }
    const source = isAbsolute(parsed.data.path)
      ? parsed.data.path
      : join(app.getPath('downloads'), parsed.data.path);
    try {
      const result = await stageBackup(source, paths);
      return success({ ...result, restartRequired: true });
    } catch (error) {
      return failure('BACKUP_IMPORT_FAILED', error instanceof Error ? error.message : '导入失败');
    }
  }

  return failure('BACKUP_UNKNOWN_ACTION', `未知备份操作：${name}`);
};
