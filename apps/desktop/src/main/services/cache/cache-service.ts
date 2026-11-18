/**
 * 应用缓存：统计与清理 AI 文件、Artifacts 与日志目录。
 */

import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { CacheTarget } from '@shared/ipc/contracts';

export interface CacheDirectories {
  files: string;
  artifacts: string;
  logs: string;
}

export interface CacheInfo {
  filesBytes: number;
  artifactsBytes: number;
  logsBytes: number;
  totalBytes: number;
  failed: CacheTarget[];
}

/**
 * 递归计算目录大小；读取失败按 0 处理，避免缓存统计阻塞设置页。
 */
const directorySize = async (directory: string): Promise<number> => {
  let total = 0;
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) {
      total += await directorySize(target);
    } else if (entry.isFile()) {
      try {
        total += (await stat(target)).size;
      } catch {
        // 文件在统计过程中被删除时忽略
      }
    }
  }

  return total;
};

/**
 * 读取当前缓存占用。
 */
export const getCacheInfo = async (directories: CacheDirectories): Promise<CacheInfo> => {
  const filesBytes = await directorySize(directories.files);
  const artifactsBytes = await directorySize(directories.artifacts);
  const logsBytes = await directorySize(directories.logs);

  return {
    filesBytes,
    artifactsBytes,
    logsBytes,
    totalBytes: filesBytes + artifactsBytes + logsBytes,
    failed: []
  };
};

/**
 * 清理指定缓存目录并保留目录本身；返回清理后的占用。
 */
export const clearCache = async (
  directories: CacheDirectories,
  target: CacheTarget
): Promise<CacheInfo> => {
  const targets: Array<keyof CacheDirectories> =
    target === 'all' ? ['files', 'artifacts', 'logs'] : [target];
  const failed: CacheTarget[] = [];

  for (const key of targets) {
    const directory = directories[key];
    try {
      await rm(directory, { recursive: true, force: true });
      await mkdir(directory, { recursive: true });
    } catch (error) {
      failed.push(key);
      console.error(`缓存目录清理失败：${key}`, error);
    }
  }

  return { ...(await getCacheInfo(directories)), failed };
};
