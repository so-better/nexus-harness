/**
 * 内置终端服务测试：PTY 数据、退出与主动关闭。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock('node-pty', () => ({ spawn: spawnMock }));

import { TerminalService } from './terminal-service';
import type { TerminalEvent } from '@shared/ipc/contracts';

interface FakePty {
  pid: number;
  onData: (handler: (data: string) => void) => { dispose: () => void };
  onExit: (handler: (event: { exitCode: number | null }) => void) => { dispose: () => void };
  write: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  emitData: (data: string) => void;
  emitExit: (exitCode: number | null) => void;
}

const makePty = (): FakePty => {
  let dataHandler: ((data: string) => void) | undefined;
  let exitHandler: ((event: { exitCode: number | null }) => void) | undefined;
  return {
    pid: 999_999,
    onData: (handler) => {
      dataHandler = handler;
      return { dispose: () => undefined };
    },
    onExit: (handler) => {
      exitHandler = handler;
      return { dispose: () => undefined };
    },
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    emitData: (data) => dataHandler?.(data),
    emitExit: (exitCode) => exitHandler?.({ exitCode })
  };
};

describe('TerminalService', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it('streams output, resolves the command and keeps an interactive shell', async () => {
    const commandPty = makePty();
    const shellPty = makePty();
    shellPty.pid = 999_998;
    spawnMock.mockReturnValueOnce(commandPty).mockReturnValueOnce(shellPty);
    const service = new TerminalService();
    const events: TerminalEvent[] = [];
    service.onEvent((event) => events.push(event));

    const task = service.startCommand({
      sessionId: 'session-1',
      cwd: '/tmp',
      command: 'echo hello'
    });
    expect(task.terminal.pid).toBe(commandPty.pid);
    commandPty.emitData('hello\r\n');
    commandPty.emitExit(0);

    await expect(task.done).resolves.toMatchObject({
      output: 'hello\r\n',
      exitCode: 0,
      closed: false
    });
    expect(events.map((event) => event.type)).toEqual(['created', 'data', 'updated']);
    expect(service.list()[0]?.pid).toBe(shellPty.pid);
    expect(service.list()[0]?.status).toBe('running');
  });

  it('keeps AI command terminals available without auto-opening the panel', async () => {
    const commandPty = makePty();
    const shellPty = makePty();
    shellPty.pid = 999_998;
    spawnMock.mockReturnValueOnce(commandPty).mockReturnValueOnce(shellPty);
    const service = new TerminalService();
    const events: TerminalEvent[] = [];
    service.onEvent((event) => events.push(event));

    const task = service.startCommand({
      sessionId: 'session-1',
      cwd: '/tmp',
      command: 'echo quiet',
      openView: false
    });
    expect(task.terminal.openView).toBe(false);
    commandPty.emitData('quiet\n');
    commandPty.emitExit(0);

    await expect(task.done).resolves.toMatchObject({ output: 'quiet\n', exitCode: 0 });
    expect(events.map((event) => event.type)).toEqual(['created', 'data', 'updated']);
    expect(service.list()[0]).toMatchObject({ openView: false, status: 'running' });
  });

  it('reuses an idle AI command terminal for subsequent commands', async () => {
    const firstCommand = makePty();
    const idleShell = makePty();
    idleShell.pid = 999_998;
    const secondCommand = makePty();
    secondCommand.pid = 999_997;
    const restoredShell = makePty();
    restoredShell.pid = 999_996;
    spawnMock
      .mockReturnValueOnce(firstCommand)
      .mockReturnValueOnce(idleShell)
      .mockReturnValueOnce(secondCommand)
      .mockReturnValueOnce(restoredShell);
    const service = new TerminalService();
    const events: TerminalEvent[] = [];
    service.onEvent((event) => events.push(event));

    const first = service.startCommand({
      sessionId: 'session-1',
      cwd: '/tmp',
      command: 'echo one',
      openView: false
    });
    firstCommand.emitData('one\n');
    firstCommand.emitExit(0);
    await first.done;

    const reusable = service.findReusableCommandTerminal('session-1');
    expect(reusable).toBe(first.terminal.id);

    const second = service.startCommand({
      sessionId: 'session-1',
      cwd: '/tmp',
      command: 'echo two',
      openView: false,
      reuseTerminalId: first.terminal.id
    });
    expect(second.terminal.id).toBe(first.terminal.id);
    expect(second.terminal.pid).toBe(secondCommand.pid);
    expect(service.list()).toHaveLength(1);
    expect(idleShell.kill).toHaveBeenCalled();
    expect(events.filter((event) => event.type === 'created')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'updated')).toHaveLength(2);

    secondCommand.emitData('two\n');
    secondCommand.emitExit(0);
    await expect(second.done).resolves.toMatchObject({ output: 'two\n', exitCode: 0 });
  });

  it('does not reuse interactive terminals or terminals that received input', async () => {
    const interactive = makePty();
    spawnMock.mockReturnValue(interactive);
    const service = new TerminalService();
    service.create({ sessionId: 'session-1', cwd: '/tmp', source: 'ai' });
    expect(service.findReusableCommandTerminal('session-1')).toBeUndefined();

    const commandPty = makePty();
    const shellPty = makePty();
    shellPty.pid = 999_998;
    spawnMock.mockReset();
    spawnMock.mockReturnValueOnce(commandPty).mockReturnValueOnce(shellPty);
    const task = service.startCommand({
      sessionId: 'session-1',
      cwd: '/tmp',
      command: 'echo hi',
      openView: false
    });
    commandPty.emitExit(0);
    await task.done;
    expect(service.findReusableCommandTerminal('session-1')).toBe(task.terminal.id);

    expect(service.write(task.terminal.id, 'ls\r')).toBe(true);
    expect(service.findReusableCommandTerminal('session-1')).toBeUndefined();
  });

  it('keeps a user-renamed title when reusing the command terminal', async () => {
    const firstCommand = makePty();
    const idleShell = makePty();
    idleShell.pid = 999_998;
    const secondCommand = makePty();
    secondCommand.pid = 999_997;
    const restoredShell = makePty();
    restoredShell.pid = 999_996;
    spawnMock
      .mockReturnValueOnce(firstCommand)
      .mockReturnValueOnce(idleShell)
      .mockReturnValueOnce(secondCommand)
      .mockReturnValueOnce(restoredShell);
    const service = new TerminalService();

    const first = service.startCommand({
      sessionId: 'session-1',
      cwd: '/tmp',
      command: 'echo one',
      openView: false
    });
    firstCommand.emitExit(0);
    await first.done;
    expect(service.updateTitle(first.terminal.id, '我的终端', true)).toBe(true);

    const second = service.startCommand({
      sessionId: 'session-1',
      cwd: '/tmp',
      command: 'echo two',
      title: 'echo two',
      openView: false,
      reuseTerminalId: first.terminal.id
    });
    expect(second.terminal.title).toBe('我的终端');
    secondCommand.emitExit(0);
    await second.done;
  });

  it('closes idle AI terminals when the run ends', async () => {
    const commandPty = makePty();
    const shellPty = makePty();
    shellPty.pid = 999_998;
    spawnMock.mockReturnValueOnce(commandPty).mockReturnValueOnce(shellPty);
    const service = new TerminalService();
    const task = service.startCommand({
      sessionId: 'session-1',
      cwd: '/tmp',
      command: 'echo hi',
      openView: false
    });
    commandPty.emitExit(0);
    await task.done;

    await expect(service.closeIdleAiTerminals('session-1')).resolves.toEqual([task.terminal.id]);
    expect(service.list()).toEqual([]);
  });

  it('keeps user-touched, busy and detached AI terminals after the run', async () => {
    const commandPty = makePty();
    const shellPty = makePty();
    shellPty.pid = 999_998;
    spawnMock.mockReturnValueOnce(commandPty).mockReturnValueOnce(shellPty);
    const service = new TerminalService();
    const busy = vi.spyOn(service, 'isBusy').mockResolvedValue(true);
    const task = service.startCommand({
      sessionId: 'session-1',
      cwd: '/tmp',
      command: 'echo hi',
      openView: false
    });
    commandPty.emitExit(0);
    await task.done;
    expect(service.write(task.terminal.id, 'ls\r', true)).toBe(true);
    await service.closeIdleAiTerminals('session-1');
    expect(service.list().some((terminal) => terminal.id === task.terminal.id)).toBe(true);

    const busyShell = makePty();
    busyShell.pid = 999_997;
    spawnMock.mockReturnValueOnce(busyShell);
    const busyTerminal = service.create({ sessionId: 'session-1', cwd: '/tmp', source: 'ai' });
    expect(service.write(busyTerminal.id, 'npm run dev\r')).toBe(true);
    await service.closeIdleAiTerminals('session-1');
    expect(service.list().some((terminal) => terminal.id === busyTerminal.id)).toBe(true);

    const detachedPty = makePty();
    spawnMock.mockReturnValueOnce(detachedPty);
    const detached = service.startCommand({
      sessionId: 'session-1',
      cwd: '/tmp',
      command: 'npm run dev',
      detached: true,
      openView: false
    });
    detachedPty.emitExit(0);
    await detached.done;
    busy.mockResolvedValue(false);
    await service.closeIdleAiTerminals('session-1');
    expect(service.list().some((terminal) => terminal.id === detached.terminal.id)).toBe(true);
  });

  it('runs detached commands without timeout and keeps an exited tab', async () => {
    const fake = makePty();
    spawnMock.mockReturnValue(fake);
    const service = new TerminalService();
    const events: TerminalEvent[] = [];
    service.onEvent((event) => events.push(event));

    const task = service.startCommand({
      sessionId: 'session-1',
      cwd: '/tmp',
      command: 'npm run dev',
      openView: false,
      detached: true
    });
    expect(task.terminal.openView).toBe(false);
    fake.emitData('ready\n');
    fake.emitExit(0);

    await expect(task.done).resolves.toMatchObject({ exitCode: 0 });
    expect(events.map((event) => event.type)).toEqual(['created', 'data', 'exit']);
    expect(service.list()[0]).toMatchObject({ status: 'exited', openView: false });
    expect(service.readOutput(task.terminal.id)?.output).toContain('ready');
  });

  it('closes a running terminal and resolves the pending command as cancelled', async () => {
    const fake = makePty();
    spawnMock.mockReturnValue(fake);
    const service = new TerminalService();
    const task = service.startCommand({
      sessionId: 'session-1',
      cwd: '/tmp',
      command: 'sleep 10'
    });

    expect(service.close(task.terminal.id)).toBe(true);
    await expect(task.done).resolves.toMatchObject({ exitCode: null, closed: true });
    expect(service.list()).toEqual([]);
  });

  it('does not cap interactive terminal output or kill the shell', () => {
    const fake = makePty();
    spawnMock.mockReturnValue(fake);
    const service = new TerminalService();
    const terminal = service.create({ sessionId: 'session-1', cwd: '/tmp' });

    fake.emitData('x'.repeat(250_000));

    expect(fake.kill).not.toHaveBeenCalled();
    expect(service.list()[0]?.status).toBe('running');
    expect(terminal.source).toBe('user');
  });

  it('keeps user terminals private to AI until explicitly granted', () => {
    const fake = makePty();
    spawnMock.mockReturnValue(fake);
    const service = new TerminalService();
    const terminal = service.create({ sessionId: 'session-1', cwd: '/tmp' });

    expect(terminal.aiAccess).toBe(false);
    expect(service.setAiAccess(terminal.id, true)).toBe(true);
    expect(service.list()[0]?.aiAccess).toBe(true);
  });

  it('scopes terminals by owner and closes them with their session', () => {
    const first = makePty();
    const second = makePty();
    second.pid = 999_997;
    spawnMock.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const service = new TerminalService();

    service.create({ sessionId: 'session-1', cwd: '/tmp', ownerId: 1 });
    service.create({ sessionId: 'session-2', cwd: '/tmp', ownerId: 2 });

    expect(service.list(1)).toHaveLength(1);
    expect(service.list(2)).toHaveLength(1);
    const sessionOne = service.list(1)[0];
    if (!sessionOne) throw new Error('terminal missing');
    expect(service.isOwnedBy(sessionOne.id, 1)).toBe(true);
    expect(service.isOwnedBy(sessionOne.id, 2)).toBe(false);

    service.closeBySession('session-1');
    expect(service.list(1)).toEqual([]);
    expect(service.list(2)).toHaveLength(1);

    service.closeByOwner(2);
    expect(service.list()).toEqual([]);
  });

  it('reorders terminals for one owner without affecting others', () => {
    const first = makePty();
    const second = makePty();
    const third = makePty();
    second.pid = 999_996;
    third.pid = 999_995;
    spawnMock.mockReturnValueOnce(first).mockReturnValueOnce(second).mockReturnValueOnce(third);
    const service = new TerminalService();
    const a = service.create({ sessionId: 's1', cwd: '/tmp', ownerId: 1 });
    const b = service.create({ sessionId: 's1', cwd: '/tmp', ownerId: 1 });
    service.create({ sessionId: 's2', cwd: '/tmp', ownerId: 2 });

    expect(service.reorder(1, [b.id, a.id])).toBe(true);
    expect(service.list(1).map((terminal) => terminal.id)).toEqual([b.id, a.id]);
    expect(service.list(2)).toHaveLength(1);
  });
});
