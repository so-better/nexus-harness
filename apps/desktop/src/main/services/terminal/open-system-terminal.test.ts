// @vitest-environment node
/**
 * 系统终端启动器：脚本内容、Terminal 调用与交互式 shell 回退。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const execFileMock = vi.hoisted(() =>
  vi.fn((...args: unknown[]) => {
    const callback = args.at(-1);
    if (typeof callback === 'function') callback(null);
  })
);
const mkdtempMock = vi.hoisted(() => vi.fn(async () => '/tmp/nexus-terminal-test'));
const writeFileMock = vi.hoisted(() =>
  vi.fn(async (_file: string, _contents: string, _options?: { mode?: number }) => undefined)
);
const chmodMock = vi.hoisted(() => vi.fn(async () => undefined));
const rmMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('node:child_process', () => ({ execFile: execFileMock }));
vi.mock('node:fs/promises', () => ({
  mkdtemp: mkdtempMock,
  writeFile: writeFileMock,
  chmod: chmodMock,
  rm: rmMock
}));

import { openSystemTerminal } from './open-system-terminal';

describe('openSystemTerminal', () => {
  let platformDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    vi.stubEnv('SHELL', '/bin/zsh');
    execFileMock.mockClear();
    mkdtempMock.mockClear();
    writeFileMock.mockClear();
    chmodMock.mockClear();
    rmMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (platformDescriptor) Object.defineProperty(process, 'platform', platformDescriptor);
  });

  it('writes a command script and opens Terminal.app', async () => {
    await openSystemTerminal({ cwd: '/Users/me/My Project', command: 'npm run dev' });

    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const firstWrite = writeFileMock.mock.calls[0];
    if (!firstWrite) throw new Error('writeFile not called');
    const [file, content, options] = firstWrite;
    expect(file).toBe('/tmp/nexus-terminal-test/open.command');
    expect(content).toContain("cd '/Users/me/My Project'");
    expect(content).toContain("'/bin/zsh' -lic 'npm run dev'");
    expect(content).toContain("exec '/bin/zsh' -l");
    expect(options?.mode).toBe(0o700);
    expect(execFileMock).toHaveBeenCalledWith(
      '/usr/bin/open',
      ['-a', 'Terminal', '/tmp/nexus-terminal-test/open.command'],
      expect.anything(),
      expect.any(Function)
    );
  });

  it('cleans up the temp directory when Terminal cannot be opened', async () => {
    execFileMock.mockImplementationOnce((...args: unknown[]) => {
      const callback = args.at(-1);
      if (typeof callback === 'function') callback(new Error('open failed'));
    });
    await expect(openSystemTerminal({ cwd: '/tmp', command: 'ls' })).rejects.toThrow('open failed');
    expect(rmMock).toHaveBeenCalledWith('/tmp/nexus-terminal-test', {
      recursive: true,
      force: true
    });
  });

  it('opens a new command prompt window on Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    await openSystemTerminal({ cwd: 'C:\\work', command: 'dir' });
    expect(writeFileMock).toHaveBeenCalledWith(
      '/tmp/nexus-terminal-test/open.cmd',
      '@echo off\r\ncd /d "C:\\work"\r\ndir\r\n'
    );
    expect(execFileMock).toHaveBeenCalledWith(
      'cmd.exe',
      ['/c', 'start', '', 'cmd.exe', '/k', '/tmp/nexus-terminal-test/open.cmd'],
      expect.anything(),
      expect.any(Function)
    );
  });

  it('opens an interactive shell when no command is provided', async () => {
    await openSystemTerminal({ cwd: '/tmp' });
    const firstWrite = writeFileMock.mock.calls[0];
    if (!firstWrite) throw new Error('writeFile not called');
    expect(firstWrite[1]).toContain("exec '/bin/zsh' -l");
    expect(firstWrite[1]).not.toContain('-lic');
  });
});
