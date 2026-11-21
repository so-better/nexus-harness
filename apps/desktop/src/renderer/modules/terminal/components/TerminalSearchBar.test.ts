// @vitest-environment jsdom
/**
 * 终端搜索栏：输入、上下查找与关闭事件。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import TerminalSearchBar from './TerminalSearchBar.vue';

const flush = async (): Promise<void> => {
  await nextTick();
  await nextTick();
};

describe('TerminalSearchBar', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('emits update, navigation and close events', async () => {
    const update = vi.fn();
    const run = vi.fn();
    const close = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(TerminalSearchBar, {
      term: 'old',
      noResult: false,
      'onUpdate:term': update,
      onRun: run,
      onClose: close
    });
    app.mount(host);
    await flush();

    const input = host.querySelector('input');
    if (!input) throw new Error('input missing');
    input.value = 'new';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    expect(update).toHaveBeenCalledWith('new');

    const buttons = [...host.querySelectorAll<HTMLButtonElement>('button')];
    buttons[0]?.click();
    buttons[1]?.click();
    buttons[2]?.click();
    expect(run).toHaveBeenNthCalledWith(1, 'previous');
    expect(run).toHaveBeenNthCalledWith(2, 'next');
    expect(close).toHaveBeenCalledOnce();
    app.unmount();
  });
});
