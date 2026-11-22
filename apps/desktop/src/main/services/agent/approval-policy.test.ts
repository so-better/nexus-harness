/**
 * 工作区信任：只自动放行工作区内文件写入和受限安全命令。
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SessionRoot } from '@shared/ipc/contracts';
import { canAutoApproveWorkspace } from './approval-policy';

describe('workspace approval policy', () => {
  let directory = '';
  let root: SessionRoot;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nexus-approval-policy-'));
    const path = join(directory, 'workspace');
    await mkdir(path);
    await writeFile(join(path, 'inside.txt'), 'ok');
    root = {
      id: 'root-1',
      sessionId: 'session-1',
      path,
      kind: 'directory',
      access: 'write',
      source: 'session',
      createdAt: 0
    };
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('auto-approves file writes inside the workspace', async () => {
    await expect(
      canAutoApproveWorkspace('write_file', { path: 'inside.txt' }, [root])
    ).resolves.toBe(true);
    await expect(
      canAutoApproveWorkspace('write_file', { path: '../outside.txt' }, [root])
    ).resolves.toBe(false);
  });

  it('auto-approves only safe commands inside the workspace', async () => {
    await expect(
      canAutoApproveWorkspace('run_command', { command: 'pnpm test' }, [root])
    ).resolves.toBe(true);
    await expect(
      canAutoApproveWorkspace('run_command', { command: 'pnpm test && rm -rf .' }, [root])
    ).resolves.toBe(false);
    await expect(
      canAutoApproveWorkspace('run_command', { command: 'pnpm test $HOME' }, [root])
    ).resolves.toBe(false);
    await expect(
      canAutoApproveWorkspace('run_command', { command: 'pnpm install' }, [root])
    ).resolves.toBe(false);
    await expect(
      canAutoApproveWorkspace('run_command', { command: 'pnpm test', cwd: '../' }, [root])
    ).resolves.toBe(false);
  });

  it('does not auto-approve when there is no workspace root', async () => {
    await expect(canAutoApproveWorkspace('write_file', { path: 'x' }, [])).resolves.toBe(false);
  });
});
