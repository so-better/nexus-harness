/**
 * Shell 调用解析：按配置路径与可执行文件名推断非交互式参数。
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildShellInvocation, resolveShellFile } from './shell';

describe('buildShellInvocation', () => {
  let directory = '';
  const makeFile = async (name: string): Promise<string> => {
    const path = join(directory, name);
    await writeFile(path, '', 'utf8');
    return path;
  };

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nexus-shell-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('uses PowerShell arguments for pwsh', async () => {
    const file = await makeFile('pwsh');
    expect(buildShellInvocation('echo hi', file)).toEqual({
      file,
      args: ['-NoProfile', '-NonInteractive', '-Command', 'echo hi']
    });
  });

  it('uses /c for cmd.exe', async () => {
    const file = await makeFile('cmd.exe');
    expect(buildShellInvocation('dir', file)).toEqual({ file, args: ['/d', '/s', '/c', 'dir'] });
  });

  it('uses -c for POSIX shells', async () => {
    const file = await makeFile('zsh');
    expect(buildShellInvocation('ls -la', file)).toEqual({ file, args: ['-c', 'ls -la'] });
  });

  it('falls back to the platform default when the configured path is missing', () => {
    const missing = join(directory, 'missing-shell');
    const invocation = buildShellInvocation('ls', missing);

    expect(invocation.file).not.toBe(missing);
    expect(invocation.args).toContain('ls');
  });

  it('resolveShellFile returns the configured file when it exists', async () => {
    const file = await makeFile('custom-shell');

    expect(resolveShellFile(file)).toBe(file);
  });

  it('accepts a bare command name and infers its arguments', () => {
    expect(resolveShellFile('pwsh')).toBe('pwsh');
    expect(buildShellInvocation('echo hi', 'pwsh')).toEqual({
      file: 'pwsh',
      args: ['-NoProfile', '-NonInteractive', '-Command', 'echo hi']
    });
  });
});
