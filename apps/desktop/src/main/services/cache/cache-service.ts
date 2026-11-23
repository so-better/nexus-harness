/**
 * 应用缓存：统计与清理 AI 文件、Artifacts、日志与 MCP 运行缓存。
 */

import { lstat, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { CacheTarget } from '@shared/ipc/contracts';

/** 上下文压缩快照是恢复历史所需数据，不参与普通缓存清理。 */
const CONTEXT_SNAPSHOT_PREFIX = 'context-history-';

export interface CacheDirectories {
  files: string;
  artifacts: string;
  logs: string;
  mcpWorkdir: string;
}

export interface CacheInfo {
  filesBytes: number;
  artifactsBytes: number;
  logsBytes: number;
  mcpBytes: number;
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
  const mcpBytes = await directorySize(directories.mcpWorkdir);

  return {
    filesBytes,
    artifactsBytes,
    logsBytes,
    mcpBytes,
    totalBytes: filesBytes + artifactsBytes + logsBytes + mcpBytes,
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
    target === 'all'
      ? ['files', 'artifacts', 'logs', 'mcpWorkdir']
      : target === 'mcp'
        ? ['mcpWorkdir']
        : [target];
  const failed = new Set<CacheTarget>();

  /**
   * 清空目录内容但保留目录本身；MCP 子进程可能正以 workdir 为 cwd。
   * 拒绝跟随符号链接，避免清理落到用户目录之外。
   */
  const clearContents = async (
    directory: string,
    preserve?: (name: string) => boolean
  ): Promise<void> => {
    try {
      const info = await lstat(directory);
      if (info.isSymbolicLink() || !info.isDirectory()) {
        await rm(directory, { recursive: true, force: true });
        await mkdir(directory, { recursive: true });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await mkdir(directory, { recursive: true });
    }
    const entries = await readdir(directory);
    await Promise.all(
      entries
        .filter((entry) => !preserve?.(entry))
        .map((entry) => rm(join(directory, entry), { recursive: true, force: true }))
    );
  };

  for (const key of targets) {
    const directory = directories[key];
    const cacheTarget: CacheTarget = key === 'mcpWorkdir' ? 'mcp' : key;
    try {
      if (key === 'mcpWorkdir') {
        await clearContents(directory);
      } else if (key === 'artifacts') {
        await clearContents(directory, (name) => name.startsWith(CONTEXT_SNAPSHOT_PREFIX));
      } else {
        await rm(directory, { recursive: true, force: true });
        await mkdir(directory, { recursive: true });
      }
    } catch (error) {
      failed.add(cacheTarget);
      console.error(`缓存目录清理失败：${key}`, error);
    }
  }

  return { ...(await getCacheInfo(directories)), failed: [...failed] };
};
