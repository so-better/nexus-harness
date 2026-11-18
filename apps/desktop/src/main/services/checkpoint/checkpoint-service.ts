/**
 * 检查点：写入前保存文件快照，支持按文件恢复。
 */

import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getAppDataPaths } from '../storage/paths';

interface CheckpointEntry {
  root: string;
  path: string;
  stored: string;
  existed: boolean;
}

export interface CreateCheckpointInput {
  sessionId: string;
  runId?: string;
  rootPath: string;
  filePath: string;
  label?: string;
}

export interface CheckpointResult {
  checkpointId: string;
  existed: boolean;
}

const encodePath = (value: string): string => Buffer.from(value, 'utf8').toString('base64url');

export class CheckpointService {
  constructor(private readonly baseDir?: string) {}

  private root(): string {
    return this.baseDir ?? getAppDataPaths().checkpoints;
  }

  /**
   * 保存单文件快照；文件不存在时记录 existed=false。
   */
  async create(input: CreateCheckpointInput): Promise<CheckpointResult> {
    const checkpointId = randomUUID();
    const directory = join(this.root(), input.sessionId, checkpointId);
    const filesDir = join(directory, 'files');
    await mkdir(filesDir, { recursive: true });

    const exists = await stat(input.filePath).then(
      () => true,
      () => false
    );
    const stored = encodePath(input.filePath);
    if (exists) await copyFile(input.filePath, join(filesDir, stored));

    const entry: CheckpointEntry = {
      root: input.rootPath,
      path: input.filePath,
      stored,
      existed: exists
    };
    await writeFile(join(directory, 'meta.json'), `${JSON.stringify([entry], null, 2)}\n`, 'utf8');

    return { checkpointId, existed: exists };
  }

  /**
   * 按检查点恢复文件；原先不存在的文件会被删除。
   */
  async restore(sessionId: string, checkpointId: string): Promise<number> {
    const directory = join(this.root(), sessionId, checkpointId);
    const raw = await readFile(join(directory, 'meta.json'), 'utf8');
    const entries = JSON.parse(raw) as CheckpointEntry[];

    let restored = 0;
    for (const entry of entries) {
      const allowed = entry.path === entry.root || entry.path.startsWith(`${entry.root}${sep}`);
      if (!allowed) throw new Error('CHECKPOINT_PATH_INVALID');

      if (entry.existed) {
        await mkdir(dirname(entry.path), { recursive: true });
        await copyFile(join(directory, 'files', entry.stored), entry.path);
      } else {
        await rm(entry.path, { force: true });
      }
      restored += 1;
    }

    return restored;
  }
}
