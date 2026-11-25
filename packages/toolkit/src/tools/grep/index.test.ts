/**
 * grep 测试：行号、相对路径与生成目录过滤。
 */

import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runGrepTool } from './index';

describe('grep', () => {
  let root = '';

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'nexus-grep-')));
    await mkdir(join(root, 'src'), { recursive: true });
    await mkdir(join(root, 'node_modules'), { recursive: true });
    await writeFile(join(root, 'src', 'a.ts'), 'const needle = 1;\n');
    await writeFile(join(root, 'src', 'b.md'), '# needle\n');
    await writeFile(join(root, 'node_modules', 'ignored.ts'), 'const needle = 2;\n');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('returns relative paths and line numbers', async () => {
    const result = await runGrepTool({ roots: [root], primaryRoot: root }, { pattern: 'needle' });
    expect(result.ok).toBe(true);
    expect(result.output).toContain('src/a.ts:1:');
    expect(result.output).toContain('src/b.md:1:');
    expect(result.output).not.toContain('ignored.ts');
  });

  it('paginates matches with offset and limit', async () => {
    await writeFile(join(root, 'multi.txt'), 'paginate-me 1\npaginate-me 2\npaginate-me 3\n');

    const first = await runGrepTool(
      { roots: [root], primaryRoot: root },
      { pattern: 'paginate-me', limit: 2 }
    );
    expect(first.output).toContain('paginate-me 1');
    expect(first.output).toContain('paginate-me 2');
    expect(first.output).not.toContain('paginate-me 3');
    expect(first.output).toContain('offset=2');

    const second = await runGrepTool(
      { roots: [root], primaryRoot: root },
      { pattern: 'paginate-me', offset: 2, limit: 2 }
    );
    expect(second.output).toContain('paginate-me 3');
    expect(second.output).not.toContain('offset=');
  });
});
