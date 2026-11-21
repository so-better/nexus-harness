// @vitest-environment node
/**
 * 插件工具：创建、导入、刷新与启停。
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginPublic } from '@shared/plugin';
import type { PluginHost } from '../plugins/plugin-host';
import { executePluginTool } from './plugin-tools';

const manifest = {
  id: 'com.example.test-plugin',
  name: 'Test plugin',
  version: '1.0.0',
  engines: { nexus: '^0.1.0' },
  contributes: {
    views: [],
    messageSlots: [],
    statusBar: [],
    commands: [],
    settings: [],
    skins: []
  }
};

const plugin: PluginPublic = {
  ...manifest,
  enabled: true,
  source: 'user',
  permissions: [],
  activationEvents: [],
  hasMain: false,
  mainLoaded: false
};

describe('plugin tools', () => {
  let pluginsDir = '';
  let sourceDir = '';
  const list = vi.fn(() => [plugin]);
  const reload = vi.fn(async () => [plugin]);
  const setEnabled = vi.fn(async () => [plugin]);
  const host = { list, reload, setEnabled } as unknown as PluginHost;

  beforeEach(async () => {
    pluginsDir = await mkdtemp(join(tmpdir(), 'nexus-plugin-tools-'));
    sourceDir = await mkdtemp(join(tmpdir(), 'nexus-plugin-source-'));
    list.mockClear();
    reload.mockClear();
    setEnabled.mockClear();
  });

  afterEach(async () => {
    await rm(pluginsDir, { recursive: true, force: true });
    await rm(sourceDir, { recursive: true, force: true });
  });

  it('creates a plugin from a file map and rejects traversal paths', async () => {
    const created = await executePluginTool(
      'plugin_create',
      { id: manifest.id, files: { 'plugin.json': JSON.stringify(manifest) } },
      { host, pluginsDir }
    );
    expect(created.ok).toBe(true);
    expect(await readFile(join(pluginsDir, manifest.id, 'plugin.json'), 'utf8')).toContain(
      manifest.id
    );

    const traversal = await executePluginTool(
      'plugin_create',
      {
        id: 'com.example.bad',
        overwrite: true,
        files: {
          'plugin.json': JSON.stringify({ ...manifest, id: 'com.example.bad' }),
          '../escape': 'x'
        }
      },
      { host, pluginsDir }
    );
    expect(traversal).toMatchObject({ ok: false, error: { code: 'PLUGIN_CREATE_FAILED' } });
  });

  it('reads an installed plugin file without workspace access', async () => {
    await executePluginTool(
      'plugin_create',
      { id: manifest.id, files: { 'plugin.json': JSON.stringify(manifest) } },
      { host, pluginsDir }
    );
    const read = await executePluginTool('plugin_read', { id: manifest.id }, { host, pluginsDir });
    expect(read.ok).toBe(true);
    expect(JSON.parse(read.output)).toMatchObject({
      id: manifest.id,
      content: expect.stringContaining(manifest.id)
    });
  });

  it('updates user plugin files and rejects built-in plugins', async () => {
    await executePluginTool(
      'plugin_create',
      { id: manifest.id, files: { 'plugin.json': JSON.stringify(manifest) } },
      { host, pluginsDir }
    );
    const updated = await executePluginTool(
      'plugin_update',
      { id: manifest.id, files: { 'assets/note.txt': 'hello' } },
      { host, pluginsDir }
    );
    expect(updated.ok).toBe(true);
    expect(await readFile(join(pluginsDir, manifest.id, 'assets', 'note.txt'), 'utf8')).toBe(
      'hello'
    );

    list.mockReturnValueOnce([{ ...plugin, source: 'builtin' }]);
    const builtin = await executePluginTool(
      'plugin_update',
      { id: manifest.id, files: { 'plugin.json': JSON.stringify(manifest) } },
      { host, pluginsDir }
    );
    expect(builtin).toMatchObject({ ok: false, error: { code: 'PLUGIN_BUILTIN_READONLY' } });
  });

  it('copies an existing plugin into a new user plugin', async () => {
    await executePluginTool(
      'plugin_create',
      {
        id: manifest.id,
        files: {
          'plugin.json': JSON.stringify(manifest),
          'renderer.mjs': 'export function activate() {}'
        }
      },
      { host, pluginsDir }
    );
    const copied = await executePluginTool(
      'plugin_create',
      { id: 'com.example.copy', fromPluginId: manifest.id },
      { host, pluginsDir }
    );
    expect(copied.ok).toBe(true);
    const copiedManifest = JSON.parse(
      await readFile(join(pluginsDir, 'com.example.copy', 'plugin.json'), 'utf8')
    ) as { id: string };
    expect(copiedManifest.id).toBe('com.example.copy');
    expect(await readFile(join(pluginsDir, 'com.example.copy', 'renderer.mjs'), 'utf8')).toContain(
      'activate'
    );
  });

  it('imports a plugin and forwards reload', async () => {
    await writeFile(join(sourceDir, 'plugin.json'), JSON.stringify(manifest));
    const result = await executePluginTool('plugin_import', { sourceDir }, { host, pluginsDir });
    expect(result.ok).toBe(true);
    expect(reload).toHaveBeenCalled();
  });

  it('lists, reloads and toggles plugins', async () => {
    const listed = await executePluginTool('plugin_list', {}, { host, pluginsDir });
    expect(listed.ok).toBe(true);
    const reloaded = await executePluginTool('plugin_reload', {}, { host, pluginsDir });
    expect(reloaded.ok).toBe(true);
    const toggled = await executePluginTool(
      'plugin_set_enabled',
      { id: manifest.id, enabled: false },
      { host, pluginsDir }
    );
    expect(toggled.ok).toBe(true);
    expect(setEnabled).toHaveBeenCalledWith(manifest.id, false);
  });
});
