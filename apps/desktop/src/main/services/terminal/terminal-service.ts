/**
 * 内置终端服务：用 node-pty 维护真实 PTY，输出通过 IPC 事件推送给渲染进程。
 */

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { basename } from 'node:path';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import * as pty from 'node-pty';
import type { TerminalEvent, TerminalSessionPublic } from '@shared/ipc/contracts';
import { buildShellInvocation, createShellEnvironment } from '@nexus/tools';

const MAX_OUTPUT_BYTES = 200_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const execFileAsync = promisify(execFile);

interface TerminalRecord {
  id: string;
  sessionId: string;
  title: string;
  cwd: string;
  shell: string;
  pid: number;
  status: 'running' | 'exited' | 'closed';
  exitCode: number | null;
  source: 'user' | 'ai';
  ownerId?: number | undefined;
  command?: string | undefined;
  createdAt: number;
  cols: number;
  rows: number;
  output: string;
  truncated: boolean;
  timedOut: boolean;
  pty: pty.IPty;
  timer?: NodeJS.Timeout | undefined;
  resolve?: ((result: CommandResult) => void) | undefined;
}

export interface CommandResult {
  terminalId: string;
  output: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
  closed: boolean;
}

interface CreateTerminalOptions {
  sessionId: string;
  cwd: string;
  cols?: number;
  rows?: number;
  source?: 'user' | 'ai';
  title?: string;
  command?: string;
  ownerId?: number;
  timeoutMs?: number;
}

/**
 * 选择用户当前 shell；命令终端按平台使用非交互式 shell。
 */
const shellForCommand = (command: string): { file: string; args: string[] } =>
  buildShellInvocation(command);

const shellForInteractive = (): { file: string; args: string[] } => {
  if (process.platform === 'win32') {
    const file = process.env['COMSPEC'] || 'powershell.exe';
    return { file, args: /powershell|pwsh/i.test(file) ? ['-NoLogo'] : [] };
  }
  const configured = process.env['SHELL'];
  const file =
    configured && existsSync(configured)
      ? configured
      : process.platform === 'darwin'
        ? '/bin/zsh'
        : '/bin/bash';
  return { file, args: ['-l'] };
};

/**
 * 内置终端管理器；窗口只消费事件，不直接接触 PTY。
 */
export class TerminalService {
  private readonly records = new Map<string, TerminalRecord>();
  private readonly listeners = new Set<(event: TerminalEvent) => void>();

  onEvent(listener: (event: TerminalEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * 判断终端是否有前台命令；空闲 shell 不算运行中命令。
   */
  async isBusy(id: string): Promise<boolean> {
    const record = this.records.get(id);
    if (!record || record.status !== 'running') return false;
    if (record.command) return true;
    if (process.platform === 'win32') {
      try {
        const { stdout } = await execFileAsync(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            `(Get-CimInstance Win32_Process -Filter "ParentProcessId=${record.pid}").Count`
          ],
          { timeout: 1_000 }
        );
        return Number(stdout.trim()) > 0;
      } catch {
        return true;
      }
    }
    const ps = existsSync('/bin/ps') ? '/bin/ps' : '/usr/bin/ps';
    try {
      const [{ stdout: tpgidOutput }, { stdout: processOutput }] = await Promise.all([
        execFileAsync(ps, ['-o', 'tpgid=', '-p', String(record.pid)]),
        execFileAsync(ps, ['-axo', 'pid=,ppid='])
      ]);
      const foreground = Number(tpgidOutput.trim());
      if (Number.isFinite(foreground) && foreground > 0 && foreground !== record.pid) {
        return true;
      }
      return processOutput.split('\n').some((line) => {
        const [, parent] = line.trim().split(/\s+/).map(Number);
        return parent === record.pid;
      });
    } catch {
      return true;
    }
  }

  list(ownerId?: number): TerminalSessionPublic[] {
    return [...this.records.values()]
      .filter((record) => ownerId === undefined || record.ownerId === ownerId)
      .map((record) => this.toPublic(record));
  }

  ownerOf(id: string): number | undefined {
    return this.records.get(id)?.ownerId;
  }

  isOwnedBy(id: string, ownerId: number): boolean {
    return this.records.get(id)?.ownerId === ownerId;
  }

  /**
   * 关闭指定会话的全部终端；删除会话时调用。
   */
  closeBySession(sessionId: string): void {
    for (const record of [...this.records.values()]) {
      if (record.sessionId === sessionId) this.close(record.id);
    }
  }

  /**
   * 关闭指定窗口名下的终端；窗口销毁时调用。
   */
  closeByOwner(ownerId: number): void {
    for (const record of [...this.records.values()]) {
      if (record.ownerId === ownerId) this.close(record.id);
    }
  }

  create(options: CreateTerminalOptions): TerminalSessionPublic {
    const record = this.createRecord(options);
    return this.toPublic(record);
  }

  /**
   * 启动一个带命令的终端；返回任务句柄，Run 等待命令结束后继续。
   */
  startCommand(options: CreateTerminalOptions & { command: string; timeoutMs?: number }): {
    terminal: TerminalSessionPublic;
    done: Promise<CommandResult>;
  } {
    const record = this.createRecord({ ...options, source: 'ai', command: options.command });
    const done = new Promise<CommandResult>((resolve) => {
      record.resolve = resolve;
      record.timer = setTimeout(() => {
        record.timedOut = true;
        this.killTree(record);
        this.finish(record, null);
      }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    });
    return { terminal: this.toPublic(record), done };
  }

  write(id: string, data: string): boolean {
    const record = this.records.get(id);
    if (!record || record.status !== 'running') return false;
    record.pty.write(data);
    return true;
  }

  resize(id: string, cols: number, rows: number): boolean {
    const record = this.records.get(id);
    if (!record || record.status !== 'running') return false;
    record.pty.resize(cols, rows);
    return true;
  }

  close(id: string): boolean {
    const record = this.records.get(id);
    if (!record) return false;
    if (record.status === 'running') {
      this.killTree(record);
      record.resolve?.({
        terminalId: record.id,
        output: record.output,
        exitCode: null,
        timedOut: record.timedOut,
        truncated: record.truncated,
        closed: true
      });
      record.resolve = undefined;
      if (record.timer) clearTimeout(record.timer);
      record.timer = undefined;
    }
    record.status = 'closed';
    this.emit({ type: 'closed', id, sessionId: record.sessionId });
    this.records.delete(id);
    return true;
  }

  disposeAll(): void {
    for (const record of this.records.values()) {
      if (record.status === 'running') this.killTree(record);
    }
    this.records.clear();
  }

  private createRecord(options: CreateTerminalOptions): TerminalRecord {
    const invocation = options.command ? shellForCommand(options.command) : shellForInteractive();
    const id = randomUUID();
    const title = (options.title ?? basename(options.cwd)) || '终端';
    const env = options.command
      ? { ...createShellEnvironment(), TERM: 'xterm-256color', COLORTERM: 'truecolor' }
      : { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' };
    const child = pty.spawn(invocation.file, invocation.args, {
      name: 'xterm-256color',
      cols: options.cols ?? 80,
      rows: options.rows ?? 24,
      cwd: options.cwd,
      env,
      ...(process.platform === 'win32' ? { useConpty: true } : {})
    });
    const record: TerminalRecord = {
      id,
      sessionId: options.sessionId,
      title,
      cwd: options.cwd,
      shell: invocation.file,
      pid: child.pid,
      status: 'running',
      exitCode: null,
      source: options.source ?? 'user',
      ...(options.ownerId === undefined ? {} : { ownerId: options.ownerId }),
      ...(options.command ? { command: options.command } : {}),
      createdAt: Date.now(),
      cols: options.cols ?? 80,
      rows: options.rows ?? 24,
      output: '',
      truncated: false,
      timedOut: false,
      pty: child
    };
    this.records.set(id, record);
    this.bind(record, child, Boolean(options.command));
    this.emit({ type: 'created', terminal: this.toPublic(record) });
    return record;
  }

  /**
   * 绑定 PTY 输出；记录被关闭或替换后，旧 PTY 的迟到事件必须丢弃。
   */
  private bind(record: TerminalRecord, child: pty.IPty, captureOutput: boolean): void {
    child.onData((data) => {
      if (record.pty !== child || record.status !== 'running') return;
      if (captureOutput) {
        record.output += data;
        if (Buffer.byteLength(record.output, 'utf8') > MAX_OUTPUT_BYTES) {
          record.output = record.output.slice(0, MAX_OUTPUT_BYTES);
          record.truncated = true;
          this.killTree(record);
          this.finish(record, null);
        }
      }
      this.emit({ type: 'data', id: record.id, data });
    });
    child.onExit(({ exitCode }) => {
      if (record.pty === child) this.finish(record, exitCode);
    });
  }

  private finish(record: TerminalRecord, exitCode: number | null): void {
    if (record.status !== 'running') return;
    if (record.timer) clearTimeout(record.timer);
    record.timer = undefined;
    record.resolve?.({
      terminalId: record.id,
      output: record.output,
      exitCode,
      timedOut: record.timedOut,
      truncated: record.truncated,
      closed: false
    });
    record.resolve = undefined;

    // AI 命令结束后保留终端：换成同一标签内的交互式 shell，用户可继续操作。
    if (record.source === 'ai') {
      this.restartInteractive(record);
      return;
    }

    record.status = 'exited';
    record.exitCode = exitCode;
    this.emit({ type: 'exit', id: record.id, exitCode, status: 'exited' });
  }

  /**
   * 在已退出的 AI 命令标签中启动交互式 shell。
   */
  private restartInteractive(record: TerminalRecord): void {
    const invocation = shellForInteractive();
    try {
      const child = pty.spawn(invocation.file, invocation.args, {
        name: 'xterm-256color',
        cols: record.cols,
        rows: record.rows,
        cwd: record.cwd,
        env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
        ...(process.platform === 'win32' ? { useConpty: true } : {})
      });
      record.pty = child;
      record.pid = child.pid;
      record.shell = invocation.file;
      record.status = 'running';
      record.exitCode = null;
      record.command = undefined;
      record.truncated = false;
      record.timedOut = false;
      record.title = basename(record.cwd) || '终端';
      this.bind(record, child, false);
      this.emit({ type: 'created', terminal: this.toPublic(record) });
    } catch {
      record.status = 'exited';
      record.exitCode = null;
      this.emit({ type: 'exit', id: record.id, exitCode: null, status: 'exited' });
    }
  }

  private killTree(record: TerminalRecord): void {
    if (record.status !== 'running') return;
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(record.pid), '/T', '/F'], { windowsHide: true });
      } else {
        process.kill(-record.pid, 'SIGTERM');
      }
    } catch {
      record.pty.kill();
    }
  }

  private emit(event: TerminalEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private toPublic(record: TerminalRecord): TerminalSessionPublic {
    return {
      id: record.id,
      sessionId: record.sessionId,
      title: record.title,
      cwd: record.cwd,
      shell: record.shell,
      pid: record.pid,
      status: record.status,
      ...(record.exitCode === null ? {} : { exitCode: record.exitCode }),
      source: record.source,
      createdAt: record.createdAt
    };
  }
}

/**
 * 主进程共享的终端管理器。
 */
export const terminalService = new TerminalService();
