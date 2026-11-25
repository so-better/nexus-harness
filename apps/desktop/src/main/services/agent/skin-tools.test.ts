// @vitest-environment node
/**
 * 皮肤工具：查询、应用、清除与非法选择校验。
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PluginPublic } from '@shared/plugin';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pluginHost = vi.hoisted(() => ({
  plugins: [] as PluginPublic[]
}));

const state = vi.hoisted(() => ({
  windows: [
    {
      isDestroyed: () => false,
      webContents: { send: vi.fn() }
    }
  ]
}));

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => state.windows }
}));

vi.mock('../plugins/plugin-host-instance', () => ({
  getPluginHost: () => ({ list: () => pluginHost.plugins })
}));

import { executeSkinTool, skinToolDefinitions } from './skin-tools';

const available = [
  {
    pluginId: 'nexus.skin-aurora',
    pluginName: '极光',
    skinId: 'aurora',
    title: '极光'
  }
];

describe('skin tools', () => {
  let settingsDir = '';

  beforeEach(async () => {
    settingsDir = await mkdtemp(join(tmpdir(), 'nexus-skin-tools-'));
    pluginHost.plugins = [];
    state.windows[0]?.webContents.send.mockClear();
  });

  afterEach(async () => {
    await rm(settingsDir, { recursive: true, force: true });
  });

  it('exposes read-only list and approved apply tools', () => {
    expect(skinToolDefinitions).toMatchObject([
      { name: 'skin_list', requiresApproval: false, permission: 'read' },
      { name: 'skin_apply', requiresApproval: true, permission: 'write' }
    ]);
  });

  it('lists, applies and clears a skin', async () => {
    const initial = await executeSkinTool('skin_list', {}, { settingsDir, available });
    expect(initial.ok).toBe(true);
    expect(JSON.parse(initial.output)).toMatchObject({
      active: null,
      skins: [expect.objectContaining({ skinId: 'aurora', active: false })]
    });

    const applied = await executeSkinTool(
      'skin_apply',
      { pluginId: 'nexus.skin-aurora', skinId: 'aurora' },
      { settingsDir, available }
    );
    expect(applied.ok).toBe(true);
    expect(JSON.parse(applied.output)).toMatchObject({
      active: { pluginId: 'nexus.skin-aurora', skinId: 'aurora' },
      skins: [expect.objectContaining({ skinId: 'aurora', active: true })]
    });
    expect(state.windows[0]?.webContents.send).toHaveBeenCalledWith(
      'settings:skinChanged',
      expect.objectContaining({
        selection: { pluginId: 'nexus.skin-aurora', skinId: 'aurora' },
        source: 'agent'
      })
    );

    const cleared = await executeSkinTool(
      'skin_apply',
      { clear: true },
      { settingsDir, available }
    );
    expect(cleared.ok).toBe(true);
    expect(JSON.parse(cleared.output)).toMatchObject({ active: null });
  });

  it('only lists skins from plugins with ui.skin permission', async () => {
    const base = {
      version: '1.0.0',
      enabled: true,
      source: 'user' as const,
      activationEvents: [],
      hasMain: false,
      mainLoaded: false,
      contributes: {
        views: [],
        messageSlots: [],
        statusBar: [],
        commands: [],
        settings: [],
        skins: [{ id: 'aurora', title: 'Aurora' }],
        startup: [],
        navigation: []
      }
    };
    pluginHost.plugins = [
      { ...base, id: 'valid', name: 'Valid', permissions: ['ui.skin'] },
      { ...base, id: 'invalid', name: 'Invalid', permissions: [] }
    ];

    const result = await executeSkinTool('skin_list', {}, { settingsDir });
    expect(result.ok).toBe(true);
    expect(JSON.parse(result.output).skins).toEqual([
      expect.objectContaining({ pluginId: 'valid', skinId: 'aurora' })
    ]);
  });

  it('rejects invalid and unknown skins', async () => {
    const unknown = await executeSkinTool(
      'skin_apply',
      { pluginId: 'missing', skinId: 'aurora' },
      { settingsDir, available }
    );
    expect(unknown).toMatchObject({ ok: false, error: { code: 'SKIN_NOT_FOUND' } });

    const invalid = await executeSkinTool('skin_apply', {}, { settingsDir, available });
    expect(invalid).toMatchObject({ ok: false, error: { code: 'SKIN_INVALID_INPUT' } });
  });
});
