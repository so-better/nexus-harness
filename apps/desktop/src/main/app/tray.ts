/**
 * 托盘服务：关闭窗口时隐藏到托盘，托盘菜单负责恢复窗口、快捷命令与真正退出。
 */
import {
  app,
  type BrowserWindow,
  Menu,
  nativeImage,
  Tray,
  type MenuItemConstructorOptions
} from 'electron';
import { join } from 'node:path';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { AppLanguage } from '@shared/ipc/contracts';

let tray: Tray | undefined;
let windowRef: BrowserWindow | undefined;
let quitting = false;
let language: AppLanguage = 'zh-CN';

const labels = (value: AppLanguage) =>
  value === 'en-US'
    ? {
        show: 'Show Nexus',
        hide: 'Hide Nexus',
        newSession: 'New Session',
        settings: 'Settings…',
        extensions: 'Extensions',
        quit: 'Quit Nexus'
      }
    : {
        show: '显示 Nexus',
        hide: '隐藏 Nexus',
        newSession: '新建会话',
        settings: '设置…',
        extensions: '扩展',
        quit: '退出 Nexus'
      };

const trayIconPath = (): string => {
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'icon.png'), join(process.resourcesPath, 'icon.ico')]
    : [join(__dirname, '../../build/icon.png'), join(__dirname, '../../build/icon.ico')];
  for (const candidate of candidates) {
    const image = nativeImage.createFromPath(candidate);
    if (!image.isEmpty()) return candidate;
  }
  console.error('托盘图标缺失，使用空图标');
  return '';
};

const createTrayImage = () => {
  const path = trayIconPath();
  const image = path ? nativeImage.createFromPath(path) : nativeImage.createEmpty();
  if (image.isEmpty()) return image;
  const resized = image.resize({ width: 18, height: 18 });
  // macOS 菜单栏使用模板图标，跟随系统深浅色
  if (process.platform === 'darwin') resized.setTemplateImage(true);
  return resized;
};

const updateMenu = (): void => {
  if (!tray) return;
  const text = labels(language);
  const window = windowRef;
  const visible = Boolean(window && !window.isDestroyed() && window.isVisible());
  const template: MenuItemConstructorOptions[] = [
    {
      label: visible ? text.hide : text.show,
      click: () => {
        if (!window || window.isDestroyed()) return;
        if (window.isVisible()) window.hide();
        else {
          window.show();
          window.focus();
        }
        updateMenu();
      }
    },
    { type: 'separator' },
    {
      label: text.newSession,
      click: () => sendCommand('session.new')
    },
    {
      label: text.settings,
      click: () => sendCommand('settings.open')
    },
    {
      label: text.extensions,
      click: () => sendCommand('extensions.open')
    },
    { type: 'separator' },
    {
      label: text.quit,
      click: () => app.quit()
    }
  ];
  tray.setContextMenu(Menu.buildFromTemplate(template));
  tray.setToolTip(`Nexus${visible ? '' : ` · ${text.show}`}`);
};

/**
 * 把主窗口挂到托盘；重复调用只更新窗口引用。
 */
export const attachTray = (window: BrowserWindow, nextLanguage: AppLanguage): void => {
  windowRef = window;
  language = nextLanguage;
  if (!tray) {
    tray = new Tray(createTrayImage());
    tray.on('click', () => {
      if (!windowRef || windowRef.isDestroyed()) return;
      if (windowRef.isVisible()) windowRef.hide();
      else {
        windowRef.show();
        windowRef.focus();
      }
      updateMenu();
    });
  }
  window.on('show', updateMenu);
  window.on('hide', updateMenu);
  window.on('closed', () => {
    if (windowRef === window) windowRef = undefined;
    updateMenu();
  });
  updateMenu();
};

/**
 * 标记应用正在退出，允许窗口真正关闭。
 */
export const markTrayQuitting = (): void => {
  quitting = true;
};

export const isTrayQuitting = (): boolean => quitting;

/**
 * 跟随应用语言更新托盘菜单文案。
 */
export const setTrayLanguage = (nextLanguage: AppLanguage): void => {
  language = nextLanguage;
  updateMenu();
};

export const disposeTray = (): void => {
  tray?.destroy();
  tray = undefined;
  windowRef = undefined;
};

const sendCommand = (commandId: string): void => {
  if (!windowRef || windowRef.isDestroyed()) return;
  windowRef.show();
  windowRef.focus();
  windowRef.webContents.send(IPC_CHANNELS.appMenuCommand, commandId);
  updateMenu();
};
