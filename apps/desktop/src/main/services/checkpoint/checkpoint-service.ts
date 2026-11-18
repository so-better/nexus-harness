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

export interface CheckpointDiff {
  checkpointId: string;
  path: string;
  existed: boolean;
  oldText: string;
  newText: string;
  truncated: boolean;
  binary: boolean;
}

const MAX_DIFF_BYTES = 1_000_000;

const readText = async (
  path: string
): Promise<{ text: string; binary: boolean; truncated: boolean }> => {
  try {
    const info = await stat(path);
    if (!info.isFile()) return { text: '', binary: false, truncated: false };
    const buffer = await readFile(path);
    const truncated = buffer.byteLength > MAX_DIFF_BYTES;
    const data = truncated ? buffer.subarray(0, MAX_DIFF_BYTES) : buffer;
    return {
      text: data.includes(0) ? '' : data.toString('utf8'),
      binary: data.includes(0),
      truncated
    };
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') {
      return { text: '', binary: false, truncated: false };
    }
    throw error;
  }
};

const encodePath = (value: string): string => Buffer.from(value, 'utf8').toString('base64url');

export class CheckpointService {
  constructor(private readonly baseDir?: string) {}

  private root(): string {
    return this.baseDir ?? getAppDataPaths().checkpoints;
  }

  /**
   * 校验会话与检查点 id，避免拼接路径时越界。
   */
  private directory(sessionId: string, checkpointId: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(sessionId) || !/^[a-zA-Z0-9_-]+$/.test(checkpointId)) {
      throw new Error('CHECKPOINT_INVALID_ID');
    }
    return join(this.root(), sessionId, checkpointId);
  }

  /**
   * 保存单文件快照；文件不存在时记录 existed=false。
   */
  async create(input: CreateCheckpointInput): Promise<CheckpointResult> {
    const checkpointId = randomUUID();
    const directory = this.directory(input.sessionId, checkpointId);
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
   * 读取检查点对应的修改前内容与当前内容，供变更审阅。
   */
  async diff(sessionId: string, checkpointId: string): Promise<CheckpointDiff> {
    const directory = this.directory(sessionId, checkpointId);
    const raw = await readFile(join(directory, 'meta.json'), 'utf8');
    const entries = JSON.parse(raw) as CheckpointEntry[];
    const entry = entries[0];
    if (!entry) throw new Error('CHECKPOINT_EMPTY');

    const oldText = entry.existed
      ? await readText(join(directory, 'files', entry.stored))
      : { text: '', binary: false, truncated: false };
    const newText = await readText(entry.path);

    return {
      checkpointId,
      path: entry.path,
      existed: entry.existed,
      oldText: oldText.text,
      newText: newText.text,
      truncated: oldText.truncated || newText.truncated,
      binary: oldText.binary || newText.binary
    };
  }

  /**
   * 读取检查点对应的文件路径，供主进程校验后打开。
   */
  async getFilePath(sessionId: string, checkpointId: string): Promise<string> {
    const directory = this.directory(sessionId, checkpointId);
    const raw = await readFile(join(directory, 'meta.json'), 'utf8');
    const entries = JSON.parse(raw) as CheckpointEntry[];
    const entry = entries[0];
    if (!entry) throw new Error('CHECKPOINT_EMPTY');
    return entry.path;
  }

  /**
   * 按检查点恢复文件；原先不存在的文件会被删除。
   */
  async restore(sessionId: string, checkpointId: string): Promise<number> {
    const directory = this.directory(sessionId, checkpointId);
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
