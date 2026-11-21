// @vitest-environment jsdom
/**
 * 终端右键菜单：动作选择、遮罩关闭与初始焦点。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import TerminalContextMenu from './TerminalContextMenu.vue';

const menu = { kind: 'tab' as const, x: 20, y: 20 };
const items = [
  { key: 'rename', label: 'Rename' },
  { key: 'divider', label: '', divider: true },
  { key: 'close', label: 'Close', danger: true }
];

const flush = async (): Promise<void> => {
  await nextTick();
  await nextTick();
};

describe('TerminalContextMenu', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('emits selected actions and focuses the first enabled item', async () => {
    const select = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(TerminalContextMenu, {
      menu,
      items,
      menuStyle: { left: '20px', top: '20px' },
      onSelect: select
    });
    app.mount(host);
    await flush();

    const buttons = [...host.querySelectorAll<HTMLButtonElement>('.nh-terminal-menu__item')];
    expect(buttons).toHaveLength(2);
    expect(document.activeElement).toBe(buttons[0]);
    buttons[1]?.click();
    expect(select).toHaveBeenCalledWith('close');
    app.unmount();
  });

  it('closes when the mask is pressed', async () => {
    const close = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(TerminalContextMenu, {
      menu,
      items,
      menuStyle: {},
      onClose: close
    });
    app.mount(host);
    await flush();

    host
      .querySelector('.nh-terminal-menu-mask')
      ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(close).toHaveBeenCalledOnce();
    app.unmount();
  });
});
