/**
 * 工作区文件搜索测试：忽略规则、敏感文件和排序。
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { searchWorkspaceFiles } from './file-search-service';

describe('searchWorkspaceFiles', () => {
  let root = '';

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'nexus-file-search-'));
    await mkdir(join(root, 'src', 'generated'), { recursive: true });
    await mkdir(join(root, 'node_modules'), { recursive: true });
    await mkdir(join(root, '.ssh'), { recursive: true });
    await writeFile(
      join(root, '.gitignore'),
      '*.log\n!important.log\nnode_modules/\n/dist/\n',
      'utf8'
    );
    await writeFile(join(root, 'src', 'generated', '.gitignore'), '*.tmp\n', 'utf8');
    await writeFile(join(root, 'src', 'user-service.ts'), 'export {}', 'utf8');
    await writeFile(join(root, 'src', 'user-service.test.ts'), 'export {}', 'utf8');
    await writeFile(join(root, 'photo.png'), 'image', 'utf8');
    await writeFile(join(root, 'debug.log'), 'debug', 'utf8');
    await writeFile(join(root, 'node_modules', 'package.js'), 'module', 'utf8');
    await writeFile(join(root, '.ssh', 'id_rsa'), 'secret', 'utf8');
    await writeFile(join(root, 'important.log'), 'keep me', 'utf8');
    await writeFile(join(root, 'src', 'generated', 'ignored.tmp'), 'ignored', 'utf8');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('finds matching files and excludes ignored or sensitive paths', async () => {
    const results = await searchWorkspaceFiles([root], 'user-service');
    expect(results.map((item) => item.relativePath)).toEqual([
      'src/user-service.test.ts',
      'src/user-service.ts'
    ]);
    expect(results.every((item) => !item.path.includes('node_modules'))).toBe(true);
  });

  it('marks image references', async () => {
    const results = await searchWorkspaceFiles([root], 'photo');
    expect(results[0]).toMatchObject({ name: 'photo.png', isImage: true });
  });

  it('does not return ignored logs or ssh keys', async () => {
    const results = await searchWorkspaceFiles([root], '');
    expect(results.some((item) => item.name === 'debug.log')).toBe(false);
    expect(results.some((item) => item.name === 'important.log')).toBe(true);
    expect(results.some((item) => item.path.includes('ignored.tmp'))).toBe(false);
    expect(results.some((item) => item.path.includes('.ssh'))).toBe(false);
  });
});
