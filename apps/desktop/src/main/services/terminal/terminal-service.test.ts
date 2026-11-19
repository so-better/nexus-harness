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
    expect(events.map((event) => event.type)).toEqual(['created', 'data', 'created']);
    expect(service.list()[0]?.pid).toBe(shellPty.pid);
    expect(service.list()[0]?.status).toBe('running');
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
