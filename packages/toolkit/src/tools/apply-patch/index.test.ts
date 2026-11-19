/**
 * apply_patch 测试：唯一匹配替换与冲突拒绝。
 */

import { mkdtemp, readFile, realpath, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runApplyPatchTool } from './index';

describe('apply_patch', () => {
  let root = '';
  let file = '';

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'nexus-patch-')));
    file = join(root, 'note.txt');
    await writeFile(file, 'before\nneedle\n[已截断]\n');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('replaces the only matching text', async () => {
    const result = await runApplyPatchTool(
      { roots: [root], primaryRoot: root },
      { path: 'note.txt', oldText: '[已截断]', newText: 'after' }
    );
    expect(result.ok).toBe(true);
    expect(await readFile(file, 'utf8')).toBe('before\nneedle\nafter\n');
  });

  it('rejects non-unique targets', async () => {
    await expect(
      runApplyPatchTool(
        { roots: [root], primaryRoot: root },
        { path: 'note.txt', oldText: 'needle', newText: 'needle\nneedle' }
      )
    ).resolves.toMatchObject({ ok: true });

    await expect(
      runApplyPatchTool(
        { roots: [root], primaryRoot: root },
        { path: 'note.txt', oldText: 'needle', newText: 'x' }
      )
    ).rejects.toMatchObject({ code: 'PATCH_TARGET_INVALID' });
  });

  it('rejects oversized files', async () => {
    await truncate(file, 10 * 1024 * 1024 + 1);
    await expect(
      runApplyPatchTool(
        { roots: [root], primaryRoot: root },
        { path: 'note.txt', oldText: 'before', newText: 'after' }
      )
    ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
  });
});
