/**
 * 插件宿主测试：扫描、内置默认启用、用户插件默认禁用与存储隔离。
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../storage/database';
import { PluginHost } from './plugin-host';

const manifest = (id: string, settings: unknown[] = []): string =>
  JSON.stringify({
    id,
    name: id,
    version: '1.0.0',
    engines: { nexus: '^0.1.0' },
    permissions: ['storage'],
    contributes: { settings }
  });

describe('PluginHost', () => {
  let directory = '';
  let pluginsDir = '';
  let db: DatabaseSync;
  let host: PluginHost;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nexus-plugin-host-'));
    pluginsDir = join(directory, 'plugins');
    await mkdir(join(pluginsDir, 'nexus.builtin'), { recursive: true });
    await writeFile(join(pluginsDir, 'nexus.builtin', 'plugin.json'), manifest('nexus.builtin'));
    await mkdir(join(pluginsDir, 'nexus.user'), { recursive: true });
    await writeFile(join(pluginsDir, 'nexus.user', 'plugin.json'), manifest('nexus.user'));
    db = createDatabase(join(directory, 'nexus.db'));
    host = new PluginHost({
      db,
      directory: pluginsDir,
      builtinIds: new Set(['nexus.builtin'])
    });
  });

  afterEach(async () => {
    await host.dispose();
    db.close();
    await rm(directory, { recursive: true, force: true });
  });

  it('enables built-in plugins by default and leaves user plugins disabled', async () => {
    const plugins = await host.scan();
    expect(plugins.find((plugin) => plugin.id === 'nexus.builtin')?.enabled).toBe(true);
    expect(plugins.find((plugin) => plugin.id === 'nexus.user')?.enabled).toBe(false);
    expect(plugins.find((plugin) => plugin.id === 'nexus.builtin')?.source).toBe('builtin');
  });

  it('persists enabled state and storage by plugin', async () => {
    await host.scan();
    await host.setEnabled('nexus.user', true);
    expect(host.list().find((plugin) => plugin.id === 'nexus.user')?.enabled).toBe(true);

    host.setStorage('nexus.user', 'foo', { value: 1 });
    expect(host.getStorage('nexus.user', 'foo')).toEqual({ value: 1 });
    expect(host.getStorage('nexus.builtin', 'foo')).toBeUndefined();
    host.deleteStorage('nexus.user', 'foo');
    expect(host.getStorage('nexus.user', 'foo')).toBeUndefined();
  });

  it('validates and persists declared settings', async () => {
    await writeFile(
      join(pluginsDir, 'nexus.user', 'plugin.json'),
      manifest('nexus.user', [{ key: 'mode', type: 'string', default: 'safe' }])
    );
    await host.scan();

    expect(host.getSettings('nexus.user')).toEqual({ mode: 'safe' });
    expect(host.setSettings('nexus.user', { mode: 'fast' })).toEqual({ mode: 'fast' });
    expect(host.getSettings('nexus.user')).toEqual({ mode: 'fast' });
    expect(() => host.setSettings('nexus.user', { unknown: 'value' })).toThrow('未声明的设置项');
    expect(() => host.setSettings('nexus.user', { mode: 1 })).toThrow('设置项类型不匹配');
  });

  it('restores persisted errors after rescanning', async () => {
    await host.scan();
    host.reportError('nexus.user', 'activation boom');

    const reloaded = await host.scan();
    expect(reloaded.find((plugin) => plugin.id === 'nexus.user')?.error).toBe('activation boom');
  });

  it('uninstalls user plugins but refuses built-in plugins', async () => {
    await host.scan();

    await host.uninstall('nexus.user');
    expect(host.list().find((plugin) => plugin.id === 'nexus.user')).toBeUndefined();
    await expect(host.uninstall('nexus.builtin')).rejects.toThrow('内置插件不能卸载');
  });
});
