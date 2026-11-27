// @vitest-environment jsdom
/**
 * NavRail 组件：渲染内置项与插件项、标记当前项、点击发出 select。
 * 仓库未装 Vue Test Utils，沿用 createApp 手动挂载的方式（与既有组件测试一致）。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import NavRail from './NavRail.vue';
import type { RailNavItem } from './nav-items';

const items: RailNavItem[] = [
  { key: 'sessions', label: '会话', icon: () => null },
  { key: 'plugin:demo:view', label: '演示视图', icon: () => null, pluginId: 'demo', viewId: 'view' }
];

let app: App | undefined;

afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = '';
});

const mountRail = (activeKey: string): { el: HTMLElement; selected: string[] } => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const selected: string[] = [];
  app = createApp({
    render: () =>
      h(NavRail, { collapsed: false, items, activeKey, onSelect: (k: string) => selected.push(k) })
  });
  app.mount(el);
  return { el, selected };
};

describe('NavRail', () => {
  it('渲染内置项与插件项，并标记当前项', () => {
    const { el } = mountRail('plugin:demo:view');
    const labels = [...el.querySelectorAll('.nh-rail__label')].map((node) => node.textContent);
    expect(labels).toEqual(['会话', '演示视图']);
    const active = el.querySelectorAll('.nh-rail__item.is-active');
    expect(active).toHaveLength(1);
    expect(active[0]?.textContent).toContain('演示视图');
  });

  it('点击菜单项发出 select', async () => {
    const { el, selected } = mountRail('sessions');
    const buttons = el.querySelectorAll<HTMLElement>('.nh-rail__item');
    buttons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(selected).toEqual(['plugin:demo:view']);
  });
});
