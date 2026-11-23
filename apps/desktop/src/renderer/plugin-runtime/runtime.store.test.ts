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
const startupChange = vi.hoisted(() => ({
  handler: undefined as
    | ((payload: {
        selection: { pluginId: string; startupId: string } | null;
        source: string;
      }) => void)
    | undefined
}));

const deniedPlugin: PluginPublic = {
  id: 'nexus.test-usage-denied',
  name: 'Denied usage',
  version: '1.0.0',
  enabled: true,
  source: 'user',
  permissions: ['ui.command'],
  activationEvents: [],
  contributes: {
    views: [],
    messageSlots: [],
    statusBar: [],
    commands: [{ id: 'usage.denied', title: 'Denied usage' }],
    settings: [],
    skins: [],
    startup: []
  },
  rendererUrl: `data:text/javascript,${encodeURIComponent(
    "export function activate(ctx) { ctx.commands.register('usage.denied', () => ctx.usage.getStats()); }\n"
  )}`,
  hasMain: false,
  mainLoaded: false
};

const plugin: PluginPublic = {
  id: 'nexus.test-skin',
  name: 'Test skin',
  version: '1.0.0',
  enabled: true,
  source: 'user',
  permissions: ['ui.skin', 'ui.startup', 'ui.command', 'ui.panel', 'usage:read'],
  activationEvents: [],
  contributes: {
    views: [{ id: 'usage.dashboard', title: 'Usage' }],
    messageSlots: [],
    statusBar: [],
    commands: [{ id: 'usage.check', title: 'Check usage' }],
    settings: [],
    skins: [{ id: 'paper', title: 'Paper' }],
    startup: [{ id: 'intro', title: 'Intro' }]
  },
  rendererUrl: `data:text/javascript,${encodeURIComponent(
    "export function activate(ctx) { ctx.skins.register('paper', () => () => {}); ctx.startup.register('intro', (_el, _ctx, finish) => { finish(); return () => {}; }); ctx.views.register('usage.dashboard', () => () => {}); ctx.commands.register('usage.check', () => ctx.usage.getStats({ bucket: 'day' })); }\n"
  )}`,
  hasMain: false,
  mainLoaded: false
};

vi.mock('./api/plugin.api', () => ({
  listPlugins: vi.fn(async () => [plugin, deniedPlugin]),
  getSelectedSkin: vi.fn(async () => null),
  getSelectedStartup: vi.fn(async () => null),
  getUsageStats: vi.fn(async () => ({
    totals: {},
    series: [],
    sessions: [],
    models: [],
    providers: []
  })),
  setSelectedSkin: vi.fn(async (selection) => selection),
  setSelectedStartup: vi.fn(async (selection) => selection),
  getPluginSettings: vi.fn(async () => ({})),
  subscribePluginChanges: vi.fn(() => () => undefined),
  subscribeSkinChanges: vi.fn((handler: (payload: PluginSkinChangedPayload) => void) => {
    skinChange.handler = handler;
    return () => undefined;
  }),
  subscribeStartupChanges: vi.fn((handler) => {
    startupChange.handler = handler;
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
import {
  getSelectedSkin,
  getUsageStats,
  setSelectedSkin,
  setSelectedStartup
} from './api/plugin.api';

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

  it('exposes a declared startup animation through the host bridge', async () => {
    const runtime = usePluginRuntimeStore();
    await runtime.init();
    await runtime.selectStartup({ pluginId: plugin.id, startupId: 'intro' });

    expect(runtime.selectedStartup).toEqual({ pluginId: plugin.id, startupId: 'intro' });
    expect(runtime.activeStartupMount).not.toBeNull();
  });

  it('applies a selected startup animation broadcast', async () => {
    const runtime = usePluginRuntimeStore();
    await runtime.init();

    startupChange.handler?.({
      selection: { pluginId: plugin.id, startupId: 'intro' },
      source: 'settings'
    });

    await vi.waitFor(() => {
      expect(runtime.selectedStartup).toEqual({ pluginId: plugin.id, startupId: 'intro' });
      expect(runtime.activeStartupMount).not.toBeNull();
    });
  });

  it('rolls back an unavailable startup animation broadcast', async () => {
    const runtime = usePluginRuntimeStore();
    await runtime.init();

    startupChange.handler?.({
      selection: { pluginId: plugin.id, startupId: 'missing' },
      source: 'settings'
    });

    await vi.waitFor(() => {
      expect(runtime.selectedStartup).toBeNull();
      expect(setSelectedStartup).toHaveBeenLastCalledWith(null);
    });
  });

  it('opens a declared plugin view through the host bridge', async () => {
    const runtime = usePluginRuntimeStore();
    await runtime.init();
    await runtime.openView('usage.dashboard');

    expect(runtime.openedView?.id).toBe('usage.dashboard');
    runtime.closeView();
    expect(runtime.openedView).toBeNull();
  });

  it('denies usage stats without the usage:read permission', async () => {
    const runtime = usePluginRuntimeStore();
    await runtime.init();
    await runtime.activateForExtensions();

    await expect(runtime.commands.get('usage.denied')?.handler()).rejects.toThrow(
      '缺少 usage:read 权限'
    );
  });

  it('lists plugin commands before activation and activates them on demand', async () => {
    const runtime = usePluginRuntimeStore();
    await runtime.init();
    expect(runtime.availableCommands).toContainEqual(
      expect.objectContaining({ id: 'usage.check', pluginId: plugin.id })
    );
    expect(runtime.commands.has('usage.check')).toBe(false);

    await runtime.activateForCommand('usage.check');
    expect(runtime.commands.has('usage.check')).toBe(true);
  });

  it('exposes usage stats through an authorized plugin command', async () => {
    const runtime = usePluginRuntimeStore();
    await runtime.init();
    await runtime.activateForExtensions();

    await runtime.commands.get('usage.check')?.handler();

    expect(getUsageStats).toHaveBeenCalledWith({ bucket: 'day' });
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
