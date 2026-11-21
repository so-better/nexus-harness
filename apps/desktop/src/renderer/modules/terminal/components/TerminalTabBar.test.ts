// @vitest-environment jsdom
/**
 * 终端标签栏：选择、右键与关闭请求事件。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import type { TerminalSessionPublic } from '@shared/ipc/contracts';
import TerminalTabBar from './TerminalTabBar.vue';

const tab: TerminalSessionPublic = {
  id: 'tab-1',
  sessionId: 'session-1',
  title: 'Terminal',
  cwd: '/tmp',
  shell: '/bin/zsh',
  customTitle: false,
  pid: 1,
  status: 'running',
  source: 'user',
  createdAt: 0
};

const flush = async (): Promise<void> => {
  await nextTick();
  await nextTick();
};

describe('TerminalTabBar', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('emits selection, context menu and close requests', async () => {
    const select = vi.fn();
    const requestClose = vi.fn();
    const contextmenu = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(TerminalTabBar, {
      tabs: [tab],
      activeId: 'tab-1',
      sessionId: 'session-1',
      renameDraft: '',
      pendingBusyCount: 0,
      onSelect: select,
      onRequestClose: requestClose,
      onContextmenu: contextmenu
    });
    app.mount(host);
    await flush();

    host.querySelector<HTMLElement>('.nh-terminal-tab')?.click();
    expect(select).toHaveBeenCalledWith('tab-1');

    host
      .querySelector<HTMLElement>('.nh-terminal-tab')
      ?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    expect(contextmenu).toHaveBeenCalled();

    host.querySelector<HTMLButtonElement>('.nh-terminal-tab__close')?.click();
    expect(requestClose).toHaveBeenCalledWith(['tab-1'], 'tab-1');
    app.unmount();
  });
});
