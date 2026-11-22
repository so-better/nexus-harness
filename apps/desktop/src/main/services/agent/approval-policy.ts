/**
 * 工作区信任模式：只自动批准工作区内文件操作和受限的安全开发命令。
 */
import { realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import type { SessionRoot } from '@shared/ipc/contracts';

const FILE_WRITE_TOOLS = new Set(['write_file', 'apply_patch']);

// 仅允许单条、无管道/重定向的常见测试与构建命令
const SAFE_COMMANDS = [
  /^(?:npm|pnpm|yarn)\s+(?:test|build|typecheck|lint|format|check)(?:\s|$)/i,
  /^(?:npm|pnpm|yarn)\s+run\s+(?:test|build|typecheck|lint|format|check)(?:\s|$)/i,
  /^(?:cargo|go|dotnet)\s+(?:test|build|check|fmt|format)(?:\s|$)/i,
  /^git\s+(?:status|diff|log|show|branch)(?:\s|$)/i
];

const isInside = (root: string, target: string): boolean =>
  target === root || target.startsWith(`${root}${sep}`);

/**
 * 安全命令必须没有 shell 链接、重定向或命令替换。
 */
const isSafeCommand = (command: string): boolean => {
  if (/[\n\r;&|><`$]/.test(command)) return false;
  return SAFE_COMMANDS.some((pattern) => pattern.test(command.trim()));
};

const resolveInsideRoot = async (
  root: string,
  raw: string | undefined
): Promise<string | undefined> => {
  const rootReal = await realpath(root).catch(() => undefined);
  if (!rootReal) return undefined;
  const target = raw ? (isAbsolute(raw) ? raw : resolve(rootReal, raw)) : rootReal;
  const canonical = await realpath(target).catch(async () => {
    const parent = await realpath(dirname(target)).catch(() => undefined);
    return parent ? join(parent, target.slice(dirname(target).length + 1)) : undefined;
  });
  return canonical && isInside(rootReal, canonical) ? canonical : undefined;
};

/**
 * 判断工作区信任模式是否可跳过审批。
 */
export const canAutoApproveWorkspace = async (
  name: string,
  input: unknown,
  roots: SessionRoot[]
): Promise<boolean> => {
  const firstRoot = roots[0];
  if (!firstRoot) return false;
  if (firstRoot.kind !== 'directory') return false;
  const root = firstRoot.path;
  const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};

  if (FILE_WRITE_TOOLS.has(name)) {
    const path = record['path'];
    if (typeof path !== 'string' || !path.trim()) return false;
    return Boolean(await resolveInsideRoot(root, path));
  }

  if (name === 'run_command') {
    const command = record['command'];
    const cwd = record['cwd'];
    if (typeof command !== 'string' || !isSafeCommand(command)) return false;
    if (cwd !== undefined && typeof cwd !== 'string') return false;
    return Boolean(await resolveInsideRoot(root, typeof cwd === 'string' ? cwd : undefined));
  }

  return false;
};
