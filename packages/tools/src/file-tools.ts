/* 文件工具：读取与列目录，所有路径限制在授权 roots 内。 */

import { open, readFile, readdir, realpath, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { z } from 'zod';

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
}

const DEFAULT_MAX_BYTES = 200_000;
const MAX_LIST_ENTRIES = 500;

const readFileInput = z.object({
  path: z.string().min(1),
  maxBytes: z.number().int().positive().max(1_000_000).optional()
});

const listDirInput = z.object({
  path: z.string().optional()
});

/* 内部错误携带稳定错误码。 */
class FileToolError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'FileToolError';
  }
}

/* 相对路径基于 primary root，绝对路径必须落在任一 root 内。 */
const resolveWithinRoots = async (
  roots: readonly string[],
  primaryRoot: string,
  target: string
): Promise<string> => {
  const absolute = isAbsolute(target) ? target : resolve(primaryRoot, target);

  const resolved = await realpath(absolute).catch(async () => {
    const parent = await realpath(dirname(absolute));
    return join(parent, basename(absolute));
  });

  const allowed = roots.some((root) => resolved === root || resolved.startsWith(`${root}${sep}`));
  if (!allowed) throw new FileToolError('PATH_OUTSIDE_ROOT', `路径不在授权范围内：${target}`);

  return resolved;
};

const validateInput = <T>(schema: z.ZodType<T>, input: unknown): T => {
  const result = schema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join('; ');
    throw new FileToolError('INVALID_INPUT', message || '工具参数不合法');
  }
  return result.data;
};

const readFileTool = async (
  roots: readonly string[],
  primaryRoot: string,
  input: unknown
): Promise<FileToolResult> => {
  const parsed = validateInput(readFileInput, input);
  const target = await resolveWithinRoots(roots, primaryRoot, parsed.path);
  const info = await stat(target);
  if (info.isDirectory()) throw new FileToolError('IS_DIRECTORY', `目标是目录：${parsed.path}`);

  const maxBytes = parsed.maxBytes ?? DEFAULT_MAX_BYTES;
  if (info.size > maxBytes) {
    const handle = await open(target, 'r');
    try {
      const buffer = Buffer.alloc(maxBytes);
      const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
      const chunk = buffer.subarray(0, bytesRead);
      if (chunk.includes(0)) {
        throw new FileToolError('BINARY_FILE', `无法读取二进制文件：${parsed.path}`);
      }
      return { ok: true, output: `${chunk.toString('utf8')}\n\n...[已截断]` };
    } finally {
      await handle.close();
    }
  }

  const buffer = await readFile(target);
  if (buffer.includes(0)) {
    throw new FileToolError('BINARY_FILE', `无法读取二进制文件：${parsed.path}`);
  }

  return { ok: true, output: buffer.toString('utf8') };
};

const listDirTool = async (
  roots: readonly string[],
  primaryRoot: string,
  input: unknown
): Promise<FileToolResult> => {
  const parsed = validateInput(listDirInput, input);
  const target = await resolveWithinRoots(roots, primaryRoot, parsed.path ?? '.');

  const entries = await readdir(target, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const lines = entries
    .slice(0, MAX_LIST_ENTRIES)
    .map((entry) => `${entry.isDirectory() ? 'dir ' : 'file'} ${entry.name}`);

  if (entries.length > MAX_LIST_ENTRIES) lines.push('...[已截断]');
  return { ok: true, output: lines.join('\n') };
};

/* 创建绑定到 roots 的文件工具集；路径解析与越界校验在此统一处理。 */
export const createFileToolset = async (rootPaths: readonly string[]): Promise<FileToolset> => {
  if (rootPaths.length === 0) throw new Error('至少需要一个授权 root');

  const roots = await Promise.all(rootPaths.map((root) => realpath(root)));
  const primaryRoot = roots[0];
  if (!primaryRoot) throw new Error('至少需要一个授权 root');

  const definitions: FileToolDefinition[] = [
    {
      name: 'read_file',
      description: '读取授权目录内的文本文件，超出大小上限时截断。',
      permission: 'read',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '相对于 root 的路径或 root 内的绝对路径' },
          maxBytes: { type: 'number', description: '最大读取字节数' }
        },
        required: ['path']
      }
    },
    {
      name: 'list_dir',
      description: '列出授权目录内的文件与子目录。',
      permission: 'read',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目录路径，默认 primary root' }
        }
      }
    }
  ];

  const execute = async (name: string, input: unknown): Promise<FileToolResult> => {
    try {
      if (name === 'read_file') return await readFileTool(roots, primaryRoot, input);
      if (name === 'list_dir') return await listDirTool(roots, primaryRoot, input);
      throw new FileToolError('TOOL_NOT_FOUND', `未知工具：${name}`);
    } catch (error) {
      if (error instanceof FileToolError) {
        return { ok: false, output: '', error: { code: error.code, message: error.message } };
      }
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return {
          ok: false,
          output: '',
          error: { code: 'FILE_NOT_FOUND', message: error.message }
        };
      }
      return {
        ok: false,
        output: '',
        error: {
          code: 'TOOL_EXECUTION_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  };

  return { definitions, execute };
};
