/**
 * glob 测试：模式匹配与生成目录过滤。
 */

import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runGlobTool } from './index';

describe('glob', () => {
  let root = '';

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'nexus-glob-')));
    await mkdir(join(root, 'src'), { recursive: true });
    await mkdir(join(root, 'node_modules'), { recursive: true });
    await writeFile(join(root, 'src', 'a.ts'), 'const needle = 1;\n');
    await writeFile(join(root, 'node_modules', 'ignored.ts'), 'const needle = 2;\n');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('finds files and skips generated directories', async () => {
    const result = await runGlobTool({ roots: [root], primaryRoot: root }, { pattern: '**/*.ts' });
    expect(result.ok).toBe(true);
    expect(result.output).toContain('src/a.ts');
    expect(result.output).not.toContain('ignored.ts');
  });
});
