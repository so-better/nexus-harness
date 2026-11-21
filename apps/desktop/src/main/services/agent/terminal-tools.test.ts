// @vitest-environment node
/**
 * 终端工具：设置、列表、创建、关闭与权限边界。
 */
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TerminalSessionPublic } from '@shared/ipc/contracts';

const mocks = vi.hoisted(() => ({
  list: vi.fn<() => TerminalSessionPublic[]>(() => []),
  create: vi.fn(),
  close: vi.fn(() => true),
  readOutput: vi.fn(),
  write: vi.fn(() => true),
  setAiAccess: vi.fn(() => true),
  windows: [
    {
      isDestroyed: () => false,
      webContents: { send: vi.fn() }
    }
  ]
}));

vi.mock('electron', () => ({
  app: { getPath: () => '' },
  BrowserWindow: { getAllWindows: () => mocks.windows }
}));

vi.mock('../terminal/terminal-service', () => ({
  terminalService: {
    list: mocks.list,
    create: mocks.create,
    close: mocks.close,
    readOutput: mocks.readOutput,
    write: mocks.write,
    setAiAccess: mocks.setAiAccess
  }
}));

import { executeTerminalTool, terminalToolDefinitions } from './terminal-tools';

const terminal: TerminalSessionPublic = {
  id: 'terminal-1',
  sessionId: 'session-1',
  title: 'Terminal',
  cwd: '/tmp',
  shell: '/bin/zsh',
  pid: 123,
  status: 'running',
  source: 'ai',
  customTitle: false,
  createdAt: 0
};

describe('terminal tools', () => {
  let settingsDir = '';
  let cwd = '';

  beforeEach(async () => {
    settingsDir = await mkdtemp(join(tmpdir(), 'nexus-terminal-tools-'));
    cwd = await mkdtemp(join(tmpdir(), 'nexus-terminal-cwd-'));
    mocks.list.mockReset();
    mocks.list.mockReturnValue([]);
    mocks.create.mockReset();
    mocks.close.mockReset();
    mocks.close.mockReturnValue(true);
    mocks.readOutput.mockReset();
    mocks.write.mockReset();
    mocks.write.mockReturnValue(true);
    mocks.setAiAccess.mockReset();
    mocks.setAiAccess.mockReturnValue(true);
  });

  afterEach(async () => {
    await rm(settingsDir, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  });

  it('exposes approved write operations and read-only inspection', () => {
    expect(terminalToolDefinitions).toMatchObject([
      { name: 'terminal_get_settings', requiresApproval: false, permission: 'read' },
      { name: 'terminal_update_settings', requiresApproval: true, permission: 'write' },
      { name: 'terminal_list', requiresApproval: false, permission: 'read' },
      { name: 'terminal_create', requiresApproval: true, permission: 'write' },
      { name: 'terminal_request_access', requiresApproval: true, permission: 'write' },
      { name: 'terminal_read', requiresApproval: false, permission: 'read' },
      { name: 'terminal_wait', requiresApproval: false, permission: 'read' },
      { name: 'terminal_write', requiresApproval: true, permission: 'write' },
      { name: 'terminal_close', requiresApproval: true, permission: 'write' }
    ]);
  });

  it('reads and updates terminal settings', async () => {
    const initial = await executeTerminalTool(
      'terminal_get_settings',
      {},
      {
        sessionId: 'session-1',
        settingsDir
      }
    );
    expect(initial.ok).toBe(true);
    expect(JSON.parse(initial.output)).toMatchObject({ fontSize: 12, copyOnSelect: false });

    const updated = await executeTerminalTool(
      'terminal_update_settings',
      { fontSize: 14, webgl: false },
      { sessionId: 'session-1', settingsDir }
    );
    expect(updated.ok).toBe(true);
    expect(JSON.parse(updated.output)).toMatchObject({ fontSize: 14, webgl: false });
    expect(mocks.windows[0]?.webContents.send).toHaveBeenCalled();
  });

  it('lists only terminals for the current session and closes owned terminals', async () => {
    mocks.list.mockReturnValue([terminal, { ...terminal, id: 'other', sessionId: 'other' }]);
    const listed = await executeTerminalTool(
      'terminal_list',
      {},
      {
        sessionId: 'session-1',
        ownerId: 7,
        settingsDir
      }
    );
    expect(JSON.parse(listed.output).terminals).toHaveLength(1);

    const closed = await executeTerminalTool(
      'terminal_close',
      { terminalId: 'terminal-1' },
      { sessionId: 'session-1', ownerId: 7, settingsDir }
    );
    expect(closed.ok).toBe(true);
    expect(mocks.close).toHaveBeenCalledWith('terminal-1');
  });

  it('reads tail output and waits for a pattern in an AI terminal', async () => {
    mocks.readOutput.mockReturnValue({
      terminal,
      output: 'VITE ready\nLocal: http://localhost:5173\n',
      truncated: false
    });

    const read = await executeTerminalTool(
      'terminal_read',
      { terminalId: 'terminal-1' },
      { sessionId: 'session-1', settingsDir }
    );
    expect(read.ok).toBe(true);
    expect(JSON.parse(read.output)).toMatchObject({
      output: expect.stringContaining('Local:'),
      terminal: expect.objectContaining({ id: 'terminal-1' })
    });

    const wait = await executeTerminalTool(
      'terminal_wait',
      { terminalId: 'terminal-1', pattern: 'Local:' },
      { sessionId: 'session-1', settingsDir }
    );
    expect(wait.ok).toBe(true);
    expect(JSON.parse(wait.output)).toMatchObject({ matched: true, timedOut: false });
  });

  it('can read and write a user-created terminal in the current session', async () => {
    mocks.readOutput.mockReturnValue({
      terminal: { ...terminal, source: 'user', aiAccess: true },
      output: 'user shell output\n',
      truncated: false
    });

    const read = await executeTerminalTool(
      'terminal_read',
      { terminalId: 'terminal-1' },
      { sessionId: 'session-1', settingsDir }
    );
    expect(read.ok).toBe(true);
    expect(JSON.parse(read.output).terminal.source).toBe('user');

    const written = await executeTerminalTool(
      'terminal_write',
      { terminalId: 'terminal-1', data: 'echo hello', submit: true },
      { sessionId: 'session-1', settingsDir }
    );
    expect(written.ok).toBe(true);
    expect(mocks.write).toHaveBeenCalledWith('terminal-1', 'echo hello\r');
  });

  it('denies a user terminal unless AI access is granted', async () => {
    mocks.readOutput.mockReturnValue({
      terminal: { ...terminal, source: 'user', aiAccess: false },
      output: 'secret\n',
      truncated: false
    });
    const denied = await executeTerminalTool(
      'terminal_read',
      { terminalId: 'terminal-1' },
      { sessionId: 'session-1', settingsDir }
    );
    expect(denied).toMatchObject({
      ok: false,
      error: {
        code: 'TERMINAL_ACCESS_DENIED',
        message: expect.stringContaining('允许 AI 操作')
      }
    });
  });

  it('requests user consent for a user terminal', async () => {
    mocks.readOutput.mockReturnValue({
      terminal: { ...terminal, source: 'user', aiAccess: false },
      output: '',
      truncated: false
    });
    const result = await executeTerminalTool(
      'terminal_request_access',
      { terminalId: 'terminal-1' },
      { sessionId: 'session-1', settingsDir }
    );
    expect(result.ok).toBe(true);
    expect(mocks.setAiAccess).toHaveBeenCalledWith('terminal-1', true);
  });

  it('writes text, submit and special keys to an AI terminal', async () => {
    mocks.readOutput.mockReturnValue({ terminal, output: '', truncated: false });

    const typed = await executeTerminalTool(
      'terminal_write',
      { terminalId: 'terminal-1', data: 'npm run dev', submit: true },
      { sessionId: 'session-1', settingsDir }
    );
    expect(typed.ok).toBe(true);
    expect(mocks.write).toHaveBeenCalledWith('terminal-1', 'npm run dev\r');

    const interrupt = await executeTerminalTool(
      'terminal_write',
      { terminalId: 'terminal-1', key: 'ctrl-c' },
      { sessionId: 'session-1', settingsDir }
    );
    expect(interrupt.ok).toBe(true);
    expect(mocks.write).toHaveBeenCalledWith('terminal-1', '\u0003');

    const blocked = await executeTerminalTool(
      'terminal_write',
      { terminalId: 'terminal-1', data: 'rm -rf /' },
      { sessionId: 'session-1', settingsDir }
    );
    expect(blocked).toMatchObject({ ok: false, error: { code: 'COMMAND_BLOCKED' } });

    const firstFragment = await executeTerminalTool(
      'terminal_write',
      { terminalId: 'terminal-1', data: 'rm -rf' },
      { sessionId: 'session-1', settingsDir }
    );
    expect(firstFragment.ok).toBe(true);
    const splitDanger = await executeTerminalTool(
      'terminal_write',
      { terminalId: 'terminal-1', data: ' /', submit: true },
      { sessionId: 'session-1', settingsDir }
    );
    expect(splitDanger).toMatchObject({ ok: false, error: { code: 'COMMAND_BLOCKED' } });
  });

  it('creates a terminal in the default working directory', async () => {
    mocks.create.mockReturnValue(terminal);
    const resolvedCwd = await realpath(cwd);
    const created = await executeTerminalTool(
      'terminal_create',
      {},
      {
        sessionId: 'session-1',
        ownerId: 7,
        rootPaths: [cwd],
        settingsDir
      }
    );
    expect(created.ok).toBe(true);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        cwd: resolvedCwd,
        source: 'ai',
        ownerId: 7
      })
    );

    const outside = await executeTerminalTool(
      'terminal_create',
      { cwd: '/' },
      { sessionId: 'session-1', rootPaths: [cwd], settingsDir }
    );
    expect(outside).toMatchObject({ ok: false, error: { code: 'TERMINAL_INVALID_CWD' } });
  });

  it('ignores file roots when choosing the default terminal cwd', async () => {
    const fileRoot = join(cwd, 'file.txt');
    await writeFile(fileRoot, 'file');
    mocks.create.mockReturnValue(terminal);
    const created = await executeTerminalTool(
      'terminal_create',
      {},
      {
        sessionId: 'session-1',
        rootPaths: [fileRoot, cwd],
        settingsDir
      }
    );
    expect(created.ok).toBe(true);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: await realpath(cwd) })
    );
  });

  it('rejects invalid settings, cwd and foreign terminal ids', async () => {
    const invalidShell = await executeTerminalTool(
      'terminal_update_settings',
      { shell: '/definitely/missing/shell' },
      { sessionId: 'session-1', settingsDir }
    );
    expect(invalidShell).toMatchObject({ ok: false, error: { code: 'TERMINAL_SETTINGS_INVALID' } });

    const invalidCwd = await executeTerminalTool(
      'terminal_create',
      { cwd: '/definitely/missing/cwd' },
      { sessionId: 'session-1', settingsDir }
    );
    expect(invalidCwd).toMatchObject({ ok: false, error: { code: 'TERMINAL_INVALID_CWD' } });

    const foreign = await executeTerminalTool(
      'terminal_close',
      { terminalId: 'missing' },
      { sessionId: 'session-1', settingsDir }
    );
    expect(foreign).toMatchObject({ ok: false, error: { code: 'TERMINAL_NOT_FOUND' } });
  });
});
