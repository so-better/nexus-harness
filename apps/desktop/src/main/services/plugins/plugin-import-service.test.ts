/**
 * 插件导入测试：有效目录、缺失入口与非法 manifest。
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { importPluginDirectory, inspectPluginDirectory } from './plugin-import-service';

describe('plugin import', () => {
  let root = '';
  let source = '';
  let plugins = '';

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'nexus-plugin-import-'));
    source = join(root, 'my-plugin');
    plugins = join(root, 'plugins');
    await mkdir(join(source, 'dist'), { recursive: true });
    await writeFile(
      join(source, 'plugin.json'),
      JSON.stringify({
        id: 'example.my-plugin',
        name: 'My Plugin',
        version: '1.0.0',
        engines: { nexus: '^0.1.0' },
        renderer: 'dist/renderer.mjs',
        activationEvents: [],
        permissions: [],
        contributes: {}
      })
    );
    await writeFile(join(source, 'dist', 'renderer.mjs'), 'export function activate() {}');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('validates and imports a plugin using its manifest id', async () => {
    await expect(inspectPluginDirectory(source)).resolves.toMatchObject({
      id: 'example.my-plugin'
    });
    await importPluginDirectory({ sourceDir: source, pluginsDir: plugins });
    await expect(
      readFile(join(plugins, 'example.my-plugin', 'dist', 'renderer.mjs'), 'utf8')
    ).resolves.toContain('activate');
  });

  it('rejects a missing renderer entry', async () => {
    await rm(join(source, 'dist', 'renderer.mjs'));
    await expect(inspectPluginDirectory(source)).rejects.toThrow('插件入口文件不存在');
  });

  it('rejects a directory without plugin.json', async () => {
    await rm(join(source, 'plugin.json'));
    await expect(inspectPluginDirectory(source)).rejects.toThrow();
  });
});
