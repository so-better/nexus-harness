/**
 * run_command 测试：命令输出与危险命令拦截。
 */

import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runRunCommandTool } from './index';

describe('run_command', () => {
  let root = '';

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'nexus-command-')));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('runs a command in the authorized cwd', async () => {
    const command =
      process.platform === 'win32' ? 'Write-Output ok' : 'node -e "console.log(\'ok\')"';
    const result = await runRunCommandTool({ roots: [root], primaryRoot: root }, { command });
    expect(result.ok).toBe(true);
    expect(result.output.trim()).toBe('ok');
  });

  it('blocks dangerous commands', async () => {
    await expect(
      runRunCommandTool({ roots: [root], primaryRoot: root }, { command: 'sudo true' })
    ).rejects.toMatchObject({ code: 'COMMAND_BLOCKED' });
  });
});
