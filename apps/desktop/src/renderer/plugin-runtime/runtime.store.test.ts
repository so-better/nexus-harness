// @vitest-environment jsdom
/**
 * 皮肤激活竞态：首次选择时必须等待已开始的插件激活，不能误判挂载失败。
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginPublic } from '@shared/plugin';

const plugin: PluginPublic = {
  id: 'nexus.test-skin',
  name: 'Test skin',
  version: '1.0.0',
  enabled: true,
  source: 'user',
  permissions: ['ui.skin'],
  activationEvents: [],
  contributes: {
    views: [],
    messageSlots: [],
    statusBar: [],
    commands: [],
    settings: [],
    skins: [{ id: 'paper', title: 'Paper' }]
  },
  rendererUrl: `data:text/javascript,${encodeURIComponent(
    "export function activate(ctx) { ctx.skins.register('paper', () => () => {}); }\n"
  )}`,
  hasMain: false,
  mainLoaded: false
};

vi.mock('./api/plugin.api', () => ({
  listPlugins: vi.fn(async () => [plugin]),
  getSelectedSkin: vi.fn(async () => null),
  setSelectedSkin: vi.fn(async (selection) => selection),
  getPluginSettings: vi.fn(async () => ({})),
  subscribePluginChanges: vi.fn(() => () => undefined),
  subscribePluginEvents: vi.fn(() => () => undefined),
  setPluginEnabled: vi.fn(async () => [plugin]),
  reloadPlugins: vi.fn(async () => [plugin]),
  importPluginDirectory: vi.fn(async () => [plugin]),
  uninstallPlugin: vi.fn(async () => [plugin]),
  getPluginStorage: vi.fn(async () => undefined),
  setPluginStorage: vi.fn(async () => undefined),
  deletePluginStorage: vi.fn(async () => undefined),
  setPluginSettings: vi.fn(async () => ({})),
  logPlugin: vi.fn(async () => undefined),
  notifyPlugin: vi.fn(async () => undefined),
  reportPluginError: vi.fn(async () => undefined),
  readPluginWorkspace: vi.fn(async () => ''),
  listPluginWorkspace: vi.fn(async () => [])
}));

import { usePluginRuntimeStore } from './runtime.store';

describe('plugin runtime skin selection', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('keeps the first selection while skin activation is already running', async () => {
    const runtime = usePluginRuntimeStore();
    await runtime.init();

    const selection = { pluginId: plugin.id, skinId: 'paper' };
    const activation = runtime.activateForSkins();
    const selecting = runtime.selectSkin(selection);
    await Promise.all([activation, selecting]);

    expect(runtime.selectedSkin).toEqual(selection);
    expect(runtime.activeSkinMount).not.toBeNull();
  });
});
