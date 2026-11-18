/**
 * 开发启动器：包装 electron-vite dev，把退出信号视为正常结束。
 * Windows 下使用 .cmd，其他平台使用本地 .bin 可执行文件。
 */

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const binName = process.platform === 'win32' ? 'electron-vite.cmd' : 'electron-vite';
const executable = resolve(appRoot, 'node_modules/.bin', binName);

const child = spawn(executable, ['dev'], {
  cwd: appRoot,
  stdio: 'inherit',
  env: process.env
});

let stopping = false;

// 转发退出信号，避免终端关闭后残留 Electron / Vite 子进程
const stop = (signal) => {
  if (stopping) return;
  stopping = true;
  child.kill(signal);
  setTimeout(() => child.kill('SIGKILL'), 3000).unref();
};

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

child.on('error', (error) => {
  console.error('启动开发服务器失败', error);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  const interrupted =
    stopping || signal === 'SIGINT' || signal === 'SIGTERM' || code === 130 || code === 143;
  process.exit(interrupted ? 0 : (code ?? 1));
});
