/**
 * 内置插件同步测试：复制、覆盖、无效 manifest 与缺失源目录。
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { syncBuiltinPlugins } from './builtin-plugin-service';

describe('syncBuiltinPlugins', () => {
  let directory = '';
  let sourceDir = '';
  let destinationDir = '';

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nexus-builtin-plugins-'));
    sourceDir = join(directory, 'resources', 'plugins');
    destinationDir = join(directory, 'userData', 'plugins');
    await mkdir(sourceDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('copies valid built-in plugins and replaces old copies', async () => {
    const pluginDir = join(sourceDir, 'nexus.alpha');
    await mkdir(join(pluginDir, 'dist'), { recursive: true });
    await writeFile(
      join(pluginDir, 'plugin.json'),
      JSON.stringify({ id: 'nexus.alpha', version: '1.0.0' })
    );
    await writeFile(join(pluginDir, 'dist', 'main.cjs'), 'new-main');

    const staleDir = join(destinationDir, 'nexus.alpha');
    await mkdir(staleDir, { recursive: true });
    await writeFile(join(staleDir, 'old.txt'), 'stale');

    const installed = await syncBuiltinPlugins({ sourceDir, destinationDir });

    expect(installed).toEqual(['nexus.alpha']);
    await expect(
      readFile(join(destinationDir, 'nexus.alpha', 'dist', 'main.cjs'), 'utf8')
    ).resolves.toBe('new-main');
    await expect(readFile(join(staleDir, 'old.txt'), 'utf8')).rejects.toThrow();
  });

  it('skips directories whose id does not match', async () => {
    const pluginDir = join(sourceDir, 'nexus.invalid');
    await mkdir(pluginDir, { recursive: true });
    await writeFile(
      join(pluginDir, 'plugin.json'),
      JSON.stringify({ id: 'nexus.other', version: '1.0.0' })
    );

    const installed = await syncBuiltinPlugins({ sourceDir, destinationDir });

    expect(installed).toEqual([]);
  });

  it('returns empty when the built-in directory is missing', async () => {
    await expect(
      syncBuiltinPlugins({ sourceDir: join(directory, 'missing'), destinationDir })
    ).resolves.toEqual([]);
  });
});
