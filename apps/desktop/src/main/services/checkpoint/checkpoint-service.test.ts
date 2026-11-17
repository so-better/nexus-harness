/* 检查点测试：快照与恢复。 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CheckpointService } from './checkpoint-service';

describe('CheckpointService', () => {
  let directory = '';
  let workspace = '';
  let checkpoints: CheckpointService;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nexus-checkpoint-'));
    workspace = await mkdtemp(join(tmpdir(), 'nexus-checkpoint-workspace-'));
    checkpoints = new CheckpointService(directory);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
    await rm(workspace, { recursive: true, force: true });
  });

  it('restores existing files', async () => {
    const file = join(workspace, 'a.txt');
    await writeFile(file, 'before', 'utf8');

    const checkpoint = await checkpoints.create({
      sessionId: 'session-1',
      rootPath: workspace,
      filePath: file
    });
    await writeFile(file, 'after', 'utf8');

    await checkpoints.restore('session-1', checkpoint.checkpointId);
    await expect(readFile(file, 'utf8')).resolves.toBe('before');
  });

  it('removes files that did not exist before', async () => {
    const file = join(workspace, 'new.txt');
    const checkpoint = await checkpoints.create({
      sessionId: 'session-1',
      rootPath: workspace,
      filePath: file
    });
    await writeFile(file, 'created', 'utf8');

    await checkpoints.restore('session-1', checkpoint.checkpointId);
    await expect(readFile(file, 'utf8').catch(() => 'missing')).resolves.toBe('missing');
  });
});
