/**
 * Shell 命令执行辅助：危险命令识别、平台调用与环境变量白名单。
 */

import { existsSync } from 'node:fs';
import { basename } from 'node:path';

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

/**
 * 识别危险命令并返回拦截原因。
 */
export const detectDangerousCommand = (command: string): string | undefined =>
  DANGEROUS_PATTERNS.find((item) => item.pattern.test(command))?.reason;

/**
 * 按可执行文件名推断非交互式调用参数；无法识别时回退到 POSIX 风格 `-c`。
 */
const commandArgsFor = (file: string, command: string): string[] => {
  const name = basename(file).toLowerCase();
  if (/^(pwsh|powershell)(\.exe)?$/.test(name)) {
    return ['-NoProfile', '-NonInteractive', '-Command', command];
  }
  if (/^cmd(\.exe)?$/.test(name)) {
    return ['/d', '/s', '/c', command];
  }
  return ['-c', command];
};

/**
 * 判断是否为裸命令名（不含路径分隔符）；裸命令名交由系统 PATH 解析。
 */
export const isBareShellName = (value: string): boolean =>
  !value.includes('/') && !value.includes('\\');

/**
 * 解析执行命令使用的 shell 文件：配置值可用时优先，否则按平台默认。
 * 路径形态需真实存在；裸命令名（如 `pwsh`）不校验存在性，交给系统 PATH。
 */
export const resolveShellFile = (configuredShell?: string | null): string => {
  if (configuredShell) {
    if (isBareShellName(configuredShell) || existsSync(configuredShell)) return configuredShell;
  }
  if (process.platform === 'win32') return 'powershell.exe';
  return process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash';
};

/**
 * 按平台与可选配置生成 Shell 调用参数；配置的 shell 必须是真实存在的文件。
 */
export const buildShellInvocation = (
  command: string,
  configuredShell?: string | null
): { file: string; args: string[] } => {
  const file = resolveShellFile(configuredShell);
  return { file, args: commandArgsFor(file, command) };
};

/**
 * 按平台清理 shell 环境变量，避免继承无关密钥。
 */
export const createShellEnvironment = (): NodeJS.ProcessEnv => {
  if (process.platform === 'win32') {
    return {
      PATH: process.env['PATH'] ?? '',
      SystemRoot: process.env['SystemRoot'] ?? '',
      TEMP: process.env['TEMP'] ?? '',
      USERPROFILE: process.env['USERPROFILE'] ?? ''
    };
  }
  return {
    PATH: process.env['PATH'] ?? '/usr/bin:/bin',
    HOME: process.env['HOME'] ?? '',
    USER: process.env['USER'] ?? '',
    TMPDIR: process.env['TMPDIR'] ?? '/tmp',
    LANG: process.env['LANG'] ?? 'en_US.UTF-8'
  };
};
