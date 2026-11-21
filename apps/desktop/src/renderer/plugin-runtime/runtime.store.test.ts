// @vitest-environment jsdom
/**
 * 皮肤激活竞态：首次选择时必须等待已开始的插件激活，不能误判挂载失败。
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginPublic, PluginSkinChangedPayload } from '@shared/plugin';

const skinChange = vi.hoisted(() => ({
  handler: undefined as ((payload: PluginSkinChangedPayload) => void) | undefined
}));

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
  subscribeSkinChanges: vi.fn((handler: (payload: PluginSkinChangedPayload) => void) => {
    skinChange.handler = handler;
    return () => undefined;
  }),
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
import { getSelectedSkin, setSelectedSkin } from './api/plugin.api';

describe('plugin runtime skin selection', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('applies an external skin selection broadcast', async () => {
    const runtime = usePluginRuntimeStore();
    await runtime.init();

    skinChange.handler?.({ selection: { pluginId: plugin.id, skinId: 'paper' }, source: 'agent' });
    await vi.waitFor(() => expect(runtime.activeSkinMount).not.toBeNull());
    expect(runtime.selectedSkin).toEqual({ pluginId: plugin.id, skinId: 'paper' });
  });

  it('rolls back a failed external skin selection', async () => {
    const runtime = usePluginRuntimeStore();
    await runtime.init();

    skinChange.handler?.({
      selection: { pluginId: plugin.id, skinId: 'missing' },
      source: 'agent'
    });
    await vi.waitFor(() => expect(runtime.selectedSkin).toBeNull());
    expect(runtime.activeSkin).toBeNull();
  });

  it('clears a persisted selection when its plugin no longer exists', async () => {
    vi.mocked(getSelectedSkin).mockResolvedValueOnce({
      pluginId: 'nexus.theme-background',
      skinId: 'paper'
    });
    const runtime = usePluginRuntimeStore();
    await runtime.init();

    expect(runtime.selectedSkin).toBeNull();
    expect(setSelectedSkin).toHaveBeenCalledWith(null);
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
