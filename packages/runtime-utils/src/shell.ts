/**
 * Shell 命令执行辅助：危险命令识别、平台调用与环境变量白名单。
 */

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
 * 按平台生成 Shell 调用参数。
 */
export const buildShellInvocation = (command: string): { file: string; args: string[] } => {
  if (process.platform === 'win32') {
    return { file: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', command] };
  }
  const file = process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash';
  return { file, args: ['-c', command] };
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
