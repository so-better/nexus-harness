// @vitest-environment node
/**
 * 备份工具：导出、状态与暂存导入。
 */
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '../storage/database';
import type { AppDataPaths } from '../storage/paths';
import { executeBackupTool } from './backup-tools';

vi.mock('electron', () => ({ app: { getPath: () => '' } }));

describe('backup tools', () => {
  let root = '';
  let output = '';
  let paths: AppDataPaths;
  let database: ReturnType<typeof createDatabase>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'nexus-backup-tools-'));
    output = await mkdtemp(join(tmpdir(), 'nexus-backup-tools-out-'));
    paths = {
      root,
      settings: join(root, 'settings'),
      files: join(root, 'files'),
      attachments: join(root, 'attachments'),
      artifacts: join(root, 'artifacts'),
      checkpoints: join(root, 'checkpoints'),
      logs: join(root, 'logs'),
      plugins: join(root, 'plugins'),
      skills: join(root, 'skills'),
      mcp: join(root, 'mcp'),
      knowledge: join(root, 'knowledge')
    };
    database = createDatabase(join(root, 'nexus.db'));
  });

  afterEach(async () => {
    database.close();
    await rm(root, { recursive: true, force: true });
    await rm(output, { recursive: true, force: true });
  });

  it('exports a backup, reports status and stages an import', async () => {
    const destination = join(output, 'backup.zip');
    const exported = await executeBackupTool(
      'backup_export',
      { path: destination },
      { paths, database }
    );
    expect(exported.ok).toBe(true);
    await expect(stat(destination)).resolves.toBeTruthy();

    const status = await executeBackupTool('backup_status', {}, { paths, database });
    expect(status.ok).toBe(true);
    expect(JSON.parse(status.output)).toMatchObject({ lastExportPath: destination });

    const imported = await executeBackupTool(
      'backup_import',
      { path: destination },
      { paths, database }
    );
    expect(imported.ok).toBe(true);
    expect(JSON.parse(imported.output)).toMatchObject({ restartRequired: true });
  });

  it('reports missing imports', async () => {
    const missing = await executeBackupTool(
      'backup_import',
      { path: join(output, 'missing.zip') },
      { paths, database }
    );
    expect(missing).toMatchObject({ ok: false, error: { code: 'BACKUP_IMPORT_FAILED' } });
  });
});
