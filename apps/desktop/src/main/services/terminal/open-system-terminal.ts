/**
 * 打开系统终端并投递命令：一次性动作，不捕获输出，不接管后续交互。
 */

import { execFile } from 'node:child_process';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface OpenSystemTerminalOptions {
  cwd: string;
  command?: string;
}

const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;

const runFile = (file: string, args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 10_000 }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });

const scheduleCleanup = (dir: string): void => {
  const timer = setTimeout(() => {
    void rm(dir, { recursive: true, force: true });
  }, 60_000);
  timer.unref();
};

/**
 * 在 macOS 打开 Terminal.app（或 Windows 打开新的命令提示符窗口），
 * 把可选命令投递进去后立即返回；命令的输出由用户在系统终端中查看。
 */
export const openSystemTerminal = async ({
  cwd,
  command
}: OpenSystemTerminalOptions): Promise<void> => {
  if (process.platform === 'darwin') {
    const dir = await mkdtemp(join(tmpdir(), 'nexus-terminal-'));
    try {
      const script = join(dir, 'open.command');
      const shell = process.env['SHELL'] ?? '/bin/zsh';
      // 用登录交互 shell 执行，确保加载用户自己的 PATH、别名与 rc；
      // 命令结束后再进入登录 shell，避免 Terminal 按“shell 正常退出即关闭窗口”直接关掉
      const body = ['#!/bin/zsh', `cd ${shellQuote(cwd)} || exit 1`];
      if (command) body.push(`${shellQuote(shell)} -lic ${shellQuote(command)}`);
      body.push(`exec ${shellQuote(shell)} -l`);
      await writeFile(script, `${body.join('\n')}\n`, { mode: 0o700 });
      await chmod(script, 0o700);
      await runFile('/usr/bin/open', ['-a', 'Terminal', script]);
      // 等 Terminal 读取脚本后再清理临时目录；即使删除，运行中的脚本也不受影响
      scheduleCleanup(dir);
    } catch (error) {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
    return;
  }

  if (process.platform === 'win32') {
    const dir = await mkdtemp(join(tmpdir(), 'nexus-terminal-'));
    try {
      const script = join(dir, 'open.cmd');
      // 通过临时 .cmd 投递命令，避免 & | ^ % 等字符被外层 cmd /c start 提前解析
      const lines = ['@echo off', `cd /d "${cwd}"`, ...(command ? [command] : [])];
      await writeFile(script, `${lines.join('\r\n')}\r\n`);
      const shell = process.env['COMSPEC'] ?? 'cmd.exe';
      await runFile(shell, ['/c', 'start', '', 'cmd.exe', '/k', script]);
      scheduleCleanup(dir);
    } catch (error) {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
    return;
  }

  throw new Error('当前平台不支持打开系统终端');
};
