/**
 * 原生菜单：打包态移除刷新/DevTools，菜单命令只展示 accelerator 由 renderer 执行。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface TemplateItem {
  label?: string;
  role?: string;
  accelerator?: string;
  registerAccelerator?: boolean;
  submenu?: TemplateItem[];
  click?: () => void;
}

const state = vi.hoisted(() => ({
  packaged: false,
  template: [] as TemplateItem[],
  popupTemplate: [] as TemplateItem[],
  builtTemplate: [] as TemplateItem[],
  about: undefined as unknown,
  popup: vi.fn(),
  openExternal: vi.fn(),
  writeText: vi.fn(),
  showAbout: vi.fn()
}));

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return state.packaged;
    },
    name: 'Nexus',
    getVersion: () => '1.0.0',
    getLocale: () => 'zh-CN',
    setAboutPanelOptions: (options: unknown) => {
      state.about = options;
    },
    showAboutPanel: state.showAbout
  },
  BrowserWindow: {
    getFocusedWindow: () => null,
    getAllWindows: () => []
  },
  Menu: {
    buildFromTemplate: (template: TemplateItem[]) => {
      state.builtTemplate = template;
      state.popupTemplate = template;
      return { popup: state.popup };
    },
    setApplicationMenu: () => {
      state.template = state.builtTemplate;
    }
  },
  shell: { openExternal: (url: string) => Promise.resolve(state.openExternal(url)) },
  clipboard: { writeText: state.writeText }
}));

import { installApplicationMenu, installWindowContextMenu } from './menu';

const findMenu = (label: string): TemplateItem | undefined =>
  state.template.find((item) => item.label === label);

describe('native application menu', () => {
  beforeEach(() => {
    state.packaged = false;
    state.template = [];
    state.popupTemplate = [];
    state.about = undefined;
    state.popup.mockReset();
    state.openExternal.mockReset();
    state.openExternal.mockResolvedValue(undefined);
    state.writeText.mockReset();
    state.showAbout.mockReset();
  });

  it('keeps rendering while removing reload and devtools in packaged builds', () => {
    state.packaged = true;
    installApplicationMenu('zh-CN');

    const view = findMenu('视图');
    expect(view?.submenu?.some((item) => item.role === 'reload')).toBe(false);
    expect(view?.submenu?.some((item) => item.role === 'toggleDevTools')).toBe(false);
    expect(view?.submenu?.some((item) => item.label === '切换全屏')).toBe(true);
  });

  it('keeps reload/devtools in development', () => {
    installApplicationMenu('zh-CN');

    const view = findMenu('视图');
    expect(view?.submenu?.some((item) => item.role === 'reload')).toBe(true);
    expect(view?.submenu?.some((item) => item.role === 'toggleDevTools')).toBe(true);
  });

  it('shows accelerators but lets the renderer own command execution', () => {
    installApplicationMenu('zh-CN');

    const view = findMenu('视图');
    const palette = view?.submenu?.find((item) => item.label === '命令面板');
    expect(palette?.accelerator).toBe('CmdOrCtrl+K');
    expect(palette?.registerAccelerator).toBe(false);
  });

  it('sets About panel metadata', () => {
    installApplicationMenu('en-US');

    expect(state.about).toMatchObject({ applicationName: 'Nexus', version: '1.0.0' });
  });

  it('builds a native link context menu', () => {
    installApplicationMenu('zh-CN');
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const window = {
      webContents: {
        on: (event: string, handler: (...args: unknown[]) => void) => handlers.set(event, handler)
      }
    };
    installWindowContextMenu(window as never);

    handlers.get('context-menu')?.(
      {},
      { linkURL: 'https://example.com', isEditable: false, selectionText: '' }
    );

    expect(state.popupTemplate[0]?.label).toBe('在浏览器中打开链接');
    state.popupTemplate[0]?.click?.();
    expect(state.openExternal).toHaveBeenCalledWith('https://example.com');
  });
});
