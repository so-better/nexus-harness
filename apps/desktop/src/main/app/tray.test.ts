/**
 * 托盘：显示/隐藏、语言切换与销毁。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface MenuItem {
  label?: string;
  click?: () => void;
}

const state = vi.hoisted(() => ({
  menu: [] as MenuItem[],
  handlers: new Map<string, () => void>(),
  destroyed: false,
  templateImage: false,
  quit: vi.fn(),
  send: vi.fn()
}));

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    quit: state.quit
  },
  Menu: {
    buildFromTemplate: (template: MenuItem[]) => {
      state.menu = template;
      return { popup: vi.fn() };
    }
  },
  nativeImage: {
    createFromPath: () => ({
      isEmpty: () => false,
      resize: () => ({
        setTemplateImage: () => {
          state.templateImage = true;
        }
      })
    })
  },
  Tray: class {
    on(event: string, handler: () => void) {
      state.handlers.set(event, handler);
    }
    setContextMenu() {}
    setToolTip() {}
    destroy() {
      state.destroyed = true;
    }
  }
}));

import { attachTray, disposeTray, isTrayQuitting, markTrayQuitting, setTrayLanguage } from './tray';

describe('tray service', () => {
  beforeEach(() => {
    state.menu = [];
    state.handlers.clear();
    state.destroyed = false;
    state.templateImage = false;
    state.quit.mockReset();
    state.send.mockReset();
  });

  const createWindow = () => {
    let visible = true;
    const handlers = new Map<string, () => void>();
    return {
      handlers,
      window: {
        isVisible: () => visible,
        show: () => {
          visible = true;
          handlers.get('show')?.();
        },
        hide: () => {
          visible = false;
          handlers.get('hide')?.();
        },
        focus: vi.fn(),
        isDestroyed: () => false,
        on: (event: string, handler: () => void) => handlers.set(event, handler),
        webContents: { send: state.send }
      }
    };
  };

  it('toggles the window and updates the menu label', () => {
    const { window } = createWindow();
    attachTray(window as never, 'zh-CN');

    expect(state.menu[0]?.label).toBe('隐藏 Nexus');
    state.menu[0]?.click?.();
    expect(state.menu[0]?.label).toBe('显示 Nexus');
  });

  it('updates tray labels when the language changes', () => {
    const { window } = createWindow();
    attachTray(window as never, 'zh-CN');
    setTrayLanguage('en-US');

    expect(state.menu[0]?.label).toBe('Hide Nexus');
  });

  it('marks quitting and disposes the tray', () => {
    const { window } = createWindow();
    attachTray(window as never, 'zh-CN');
    markTrayQuitting();
    expect(isTrayQuitting()).toBe(true);
    disposeTray();
    expect(state.destroyed).toBe(true);
  });
});
