// @vitest-environment jsdom
/**
 * 导航栏项合并与主区插件视图：内置项在前，插件 navigation 贡献项在后并携带 pluginId/viewId。
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginPublic } from '@shared/plugin';

const navPlugin: PluginPublic = {
  id: 'nexus.test-nav',
  name: 'Nav',
  version: '1.0.0',
  enabled: true,
  source: 'user',
  permissions: ['ui.panel'],
  activationEvents: [],
  contributes: {
    views: [{ id: 'demo.view', title: '演示视图' }],
    navigation: [{ id: 'demo', title: '演示视图', viewId: 'demo.view', icon: 'spark' }],
    messageSlots: [],
    statusBar: [],
    commands: [],
    settings: [],
    skins: [],
    startup: []
  },
  rendererUrl: `data:text/javascript,${encodeURIComponent(
    "export function activate(ctx) { ctx.views.register('demo.view', () => () => {}); }\n"
  )}`,
  hasMain: false,
  shadowDom: true,
  mainLoaded: false
};

vi.mock('@/plugin-runtime/api/plugin.api', () => ({
  listPlugins: vi.fn(async () => [navPlugin]),
  getSelectedSkin: vi.fn(async () => null),
  getSelectedStartup: vi.fn(async () => null),
  getPluginSettings: vi.fn(async () => ({})),
  subscribePluginChanges: vi.fn(() => () => undefined),
  subscribeSkinChanges: vi.fn(() => () => undefined),
  subscribeStartupChanges: vi.fn(() => () => undefined),
  subscribePluginEvents: vi.fn(() => () => undefined),
  setPluginEnabled: vi.fn(async () => [navPlugin]),
  reloadPlugins: vi.fn(async () => [navPlugin]),
  importPluginDirectory: vi.fn(async () => [navPlugin]),
  uninstallPlugin: vi.fn(async () => [navPlugin]),
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

import { usePluginRuntimeStore } from '@/plugin-runtime/runtime.store';
import { listPlugins } from '@/plugin-runtime/api/plugin.api';
import { useRailNav } from './use-rail-nav';
import { SESSIONS_NAV_ID } from './nav-items';

const assetPlugin: PluginPublic = {
  ...navPlugin,
  id: 'nexus.test-asset',
  contributes: {
    ...navPlugin.contributes,
    navigation: [
      {
        id: 'demo',
        title: '演示视图',
        viewId: 'demo.view',
        iconAsset: 'assets/icon.svg'
      }
    ]
  }
};

describe('useRailNav', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('内置项在前，插件 navigation 合并在后并携带 pluginId/viewId', async () => {
    const store = usePluginRuntimeStore();
    await store.init();
    const { items } = useRailNav();
    expect(items.value.map((item) => item.key)).toEqual([
      SESSIONS_NAV_ID,
      'plugin:nexus.test-nav:demo'
    ]);
    expect(items.value[1]).toMatchObject({ pluginId: 'nexus.test-nav', viewId: 'demo.view' });
  });

  it('iconAsset 优先：以插件资源 URL 做 mask 单色渲染', async () => {
    vi.mocked(listPlugins).mockResolvedValueOnce([assetPlugin]);
    const store = usePluginRuntimeStore();
    await store.init();
    const { items } = useRailNav();
    const item = items.value.at(1);
    if (!item) throw new Error('缺少插件导航项');
    const render = item.icon as unknown as () => {
      type: unknown;
      props: { style: Record<string, string> };
    };
    const vnode = render();
    expect(vnode.type).toBe('span');
    expect(vnode.props.style.maskImage).toContain(
      'nexus-plugin://nexus.test-asset/assets/icon.svg'
    );
    expect(vnode.props.style.backgroundColor).toBe('currentColor');
  });

  it('openMainView 打开主区视图，closeMainView 关闭', async () => {
    const store = usePluginRuntimeStore();
    await store.init();
    await store.openMainView('nexus.test-nav', 'demo.view');
    expect(store.mainView?.id).toBe('demo.view');
    expect(store.openedView).toBeNull();
    store.closeMainView();
    expect(store.mainView).toBeNull();
  });
});
