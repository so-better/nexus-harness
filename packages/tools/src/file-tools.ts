/* 文件工具：读取与列目录，所有路径限制在授权 roots 内。 */

import { spawn } from 'node:child_process';
import { mkdir, open, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
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
  resolvePath: (
    target: string,
    options?: { mode?: 'read' | 'write'; createDirs?: boolean }
  ) => Promise<string>;
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

const writeFileInput = z.object({
  path: z.string().min(1).max(4096),
  content: z.string().max(800_000),
  createDirs: z.boolean().optional()
});

const applyPatchInput = z.object({
  path: z.string().min(1).max(4096),
  oldText: z.string().min(1).max(800_000),
  newText: z.string().max(800_000)
});

const runCommandInput = z.object({
  command: z.string().min(1).max(10_000),
  cwd: z.string().optional(),
  timeoutMs: z.number().int().positive().max(120_000).optional()
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

/* 判断真实路径是否在 roots 内。 */
const isInsideRoots = (roots: readonly string[], target: string): boolean =>
  roots.some((root) => target === root || target.startsWith(`${root}${sep}`));

/* 写入路径允许末级文件不存在；先校验最近存在的祖先，避免符号链接逃逸。 */
const resolveForWrite = async (
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

const writeFileTool = async (
  roots: readonly string[],
  primaryRoot: string,
  input: unknown
): Promise<FileToolResult> => {
  const parsed = validateInput(writeFileInput, input);
  const target = await resolveForWrite(roots, primaryRoot, parsed.path, parsed.createDirs ?? false);
  await writeFile(target, parsed.content, 'utf8');
  return {
    ok: true,
    output: `已写入 ${parsed.path}（${Buffer.byteLength(parsed.content, 'utf8')} bytes）`
  };
};

const applyPatchTool = async (
  roots: readonly string[],
  primaryRoot: string,
  input: unknown
): Promise<FileToolResult> => {
  const parsed = validateInput(applyPatchInput, input);
  const target = await resolveWithinRoots(roots, primaryRoot, parsed.path);
  const content = await readFile(target, 'utf8');
  const occurrences = content.split(parsed.oldText).length - 1;
  if (occurrences !== 1) {
    throw new FileToolError(
      'PATCH_TARGET_INVALID',
      `待替换文本出现 ${occurrences} 次，必须恰好 1 次`
    );
  }

  const updated = content.replace(parsed.oldText, parsed.newText);
  await writeFile(target, updated, 'utf8');
  return { ok: true, output: `已更新 ${parsed.path}` };
};

const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\brm\s+-[^\s]*[rf][^\s]*\s+(\/|~\/?|\*|\.\.?)(\s|$)/,
    reason: '禁止递归删除根/主目录或通配符'
  },
  {
    pattern: /\brm\s+-[^\s]*[rf][^\s]*\s+(\/Users|\/home|\/var|\/etc|\/System)(\/|\s|$)/,
    reason: '禁止递归删除系统目录'
  },
  { pattern: /\bgit\s+reset\s+--hard\b/, reason: '禁止硬重置仓库' },
  { pattern: /\bgit\s+clean\s+-[a-z]*f[a-z]*/, reason: '禁止强制清理未跟踪文件' },
  { pattern: /\bfind\b[^\n]*-delete\b/, reason: '禁止批量删除文件' },
  { pattern: /\bsudo\b|\bsu\b/, reason: '禁止提权命令' },
  { pattern: /\bmkfs\b|\bdd\s+if=\/dev\//, reason: '禁止磁盘操作' },
  { pattern: /\bchmod\s+777\b/, reason: '禁止全开放权限' },
  { pattern: /\bshutdown\b|\breboot\b|\bhalt\b/, reason: '禁止关机/重启' },
  { pattern: /(curl|wget)[^|\n]*\|\s*(sh|bash)\b/, reason: '禁止管道执行远程脚本' },
  { pattern: /:\(\)\s*\{\s*:\|:&\s*\}\s*;:/, reason: '禁止 fork 炸弹' }
];

const detectDangerousCommand = (command: string): string | undefined =>
  DANGEROUS_PATTERNS.find((item) => item.pattern.test(command))?.reason;

const buildShellInvocation = (command: string): { file: string; args: string[] } => {
  if (process.platform === 'win32') {
    return { file: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', command] };
  }
  const file = process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash';
  return { file, args: ['-c', command] };
};

const runCommandTool = async (
  roots: readonly string[],
  primaryRoot: string,
  input: unknown
): Promise<FileToolResult> => {
  const parsed = validateInput(runCommandInput, input);
  const danger = detectDangerousCommand(parsed.command);
  if (danger) throw new FileToolError('COMMAND_BLOCKED', danger);

  const cwd = await resolveWithinRoots(roots, primaryRoot, parsed.cwd ?? '.');
  const cwdInfo = await stat(cwd);
  if (!cwdInfo.isDirectory()) throw new FileToolError('INVALID_CWD', 'cwd 必须是目录');

  const timeoutMs = parsed.timeoutMs ?? 30_000;
  const maxOutputBytes = 200_000;
  const invocation = buildShellInvocation(parsed.command);
  const env =
    process.platform === 'win32'
      ? {
          PATH: process.env['PATH'] ?? '',
          SystemRoot: process.env['SystemRoot'] ?? '',
          TEMP: process.env['TEMP'] ?? '',
          USERPROFILE: process.env['USERPROFILE'] ?? ''
        }
      : {
          PATH: process.env['PATH'] ?? '/usr/bin:/bin',
          HOME: process.env['HOME'] ?? '',
          USER: process.env['USER'] ?? '',
          TMPDIR: process.env['TMPDIR'] ?? '/tmp',
          LANG: process.env['LANG'] ?? 'en_US.UTF-8'
        };

  return new Promise<FileToolResult>((resolve) => {
    const child = spawn(invocation.file, invocation.args, {
      cwd,
      env,
      detached: process.platform !== 'win32'
    });

    let output = '';
    let truncated = false;
    let timedOut = false;
    let finished = false;

    const finish = (code: number | null, error?: string): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (timedOut) {
        resolve({ ok: false, output, error: { code: 'COMMAND_TIMEOUT', message: '命令执行超时' } });
        return;
      }
      if (truncated) {
        resolve({
          ok: false,
          output,
          error: { code: 'COMMAND_OUTPUT_TRUNCATED', message: '输出超限被截断' }
        });
        return;
      }
      if (error) {
        resolve({ ok: false, output, error: { code: 'COMMAND_FAILED', message: error } });
        return;
      }
      if (code === 0) resolve({ ok: true, output });
      else
        resolve({
          ok: false,
          output,
          error: { code: 'COMMAND_EXIT_NONZERO', message: `退出码 ${code ?? 'unknown'}` }
        });
    };

    const killTree = (): void => {
      if (!child.pid) return;
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
        } else {
          process.kill(-child.pid, 'SIGTERM');
        }
      } catch {
        child.kill('SIGTERM');
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
    }, timeoutMs);

    const append = (chunk: Buffer): void => {
      if (truncated) return;
      output += chunk.toString('utf8');
      if (Buffer.byteLength(output, 'utf8') > maxOutputBytes) {
        output = output.slice(0, maxOutputBytes);
        truncated = true;
        killTree();
      }
    };

    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.on('error', (error) => finish(null, error.message));
    child.on('close', (code) => finish(code));
  });
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
    },
    {
      name: 'write_file',
      description: '写入授权目录内的文本文件；写前需要用户审批。',
      permission: 'write',
      requiresApproval: true,
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
          createDirs: { type: 'boolean' }
        },
        required: ['path', 'content']
      }
    },
    {
      name: 'apply_patch',
      description: '在授权文件内替换唯一匹配的文本；写前需要用户审批。',
      permission: 'write',
      requiresApproval: true,
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          oldText: { type: 'string' },
          newText: { type: 'string' }
        },
        required: ['path', 'oldText', 'newText']
      }
    },
    {
      name: 'run_command',
      description: '在授权目录内执行命令；需要用户审批，超时会终止进程树。',
      permission: 'execute',
      requiresApproval: true,
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          cwd: { type: 'string' },
          timeoutMs: { type: 'number' }
        },
        required: ['command']
      }
    }
  ];

  const execute = async (name: string, input: unknown): Promise<FileToolResult> => {
    try {
      if (name === 'read_file') return await readFileTool(roots, primaryRoot, input);
      if (name === 'list_dir') return await listDirTool(roots, primaryRoot, input);
      if (name === 'write_file') return await writeFileTool(roots, primaryRoot, input);
      if (name === 'apply_patch') return await applyPatchTool(roots, primaryRoot, input);
      if (name === 'run_command') return await runCommandTool(roots, primaryRoot, input);
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

  const resolvePath: FileToolset['resolvePath'] = async (target, options = {}) =>
    options.mode === 'write'
      ? resolveForWrite(roots, primaryRoot, target, options.createDirs ?? false)
      : resolveWithinRoots(roots, primaryRoot, target);

  return { definitions, execute, resolvePath };
};
