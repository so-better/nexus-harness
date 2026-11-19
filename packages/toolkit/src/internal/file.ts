/**
 * 文件工具共享类型、输入校验与授权路径解析。
 */

import { mkdir, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import type { z } from 'zod';
import { isSensitivePath } from '@nexus/runtime-utils';

export interface FileToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  permission: 'read' | 'write' | 'execute' | 'network';
  requiresApproval: boolean;
}

export interface FileToolResult {
  ok: boolean;
  output: string;
  error?: { code: string; message: string };
}

export interface FileToolset {
  definitions: FileToolDefinition[];
  execute: (name: string, input: unknown) => Promise<FileToolResult>;
  resolvePath: (
    target: string,
    options?: { mode?: 'read' | 'write'; createDirs?: boolean }
  ) => Promise<string>;
}

export interface FileToolContext {
  roots: readonly string[];
  primaryRoot: string;
}

export class FileToolError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'FileToolError';
  }
}

export const validateInput = <T>(schema: z.ZodType<T>, input: unknown): T => {
  const result = schema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join('; ');
    throw new FileToolError('INVALID_INPUT', message || '工具参数不合法');
  }
  return result.data;
};

const isInsideRoots = (roots: readonly string[], target: string): boolean =>
  roots.some((root) => target === root || target.startsWith(`${root}${sep}`));

/**
 * 相对路径基于 primary root，绝对路径必须落在任一 root 内。
 */
export const resolveWithinRoots = async (
  roots: readonly string[],
  primaryRoot: string,
  target: string
): Promise<string> => {
  const absolute = isAbsolute(target) ? target : resolve(primaryRoot, target);
  const resolved = await realpath(absolute).catch(async () => {
    const parent = await realpath(dirname(absolute));
    return join(parent, basename(absolute));
  });
  if (!isInsideRoots(roots, resolved)) {
    throw new FileToolError('PATH_OUTSIDE_ROOT', `路径不在授权范围内：${target}`);
  }
  if (isSensitivePath(resolved)) {
    throw new FileToolError('PATH_SENSITIVE', `敏感路径不可访问：${target}`);
  }
  return resolved;
};

/**
 * 写入路径允许末级文件不存在；先校验最近存在的祖先。
 */
export const resolveForWrite = async (
  roots: readonly string[],
  primaryRoot: string,
  target: string,
  createDirs: boolean
): Promise<string> => {
  const absolute = isAbsolute(target) ? target : resolve(primaryRoot, target);
  let current = dirname(absolute);
  while (true) {
    try {
      const real = await realpath(current);
      if (!isInsideRoots(roots, real)) {
        throw new FileToolError('PATH_OUTSIDE_ROOT', `路径不在授权范围内：${target}`);
      }
      if (createDirs) await mkdir(dirname(absolute), { recursive: true });
      return resolveWithinRoots(roots, primaryRoot, absolute);
    } catch (error) {
      if (error instanceof FileToolError) throw error;
      if ((error as { code?: string }).code !== 'ENOENT') throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
};
