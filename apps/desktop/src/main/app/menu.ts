/**
 * 原生应用菜单与编辑上下文菜单。
 * 打包版不提供网页式刷新、强制刷新和 DevTools；开发态保留便捷调试。
 */
import {
  app,
  BrowserWindow,
  clipboard,
  Menu,
  shell,
  type MenuItemConstructorOptions
} from 'electron';
import { join } from 'node:path';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { AppLanguage } from '@shared/ipc/contracts';

let currentLanguage: AppLanguage = 'zh-CN';

const labels = (language: AppLanguage) =>
  language === 'en-US'
    ? {
        file: 'File',
        newSession: 'New Session',
        settings: 'Settings…',
        close: 'Hide Window',
        quit: 'Quit',
        edit: 'Edit',
        view: 'View',
        commandPalette: 'Command Palette',
        search: 'Search Sessions',
        extensions: 'Extensions',
        terminal: 'Toggle Terminal',
        theme: 'Toggle Theme',
        window: 'Window',
        help: 'Help',
        changelog: 'What’s New',
        fullScreen: 'Toggle Full Screen',
        about: 'About Nexus',
        openLink: 'Open Link in Browser',
        copyLink: 'Copy Link'
      }
    : {
        file: '文件',
        newSession: '新建会话',
        settings: '设置…',
        close: '隐藏窗口',
        quit: '退出',
        edit: '编辑',
        view: '视图',
        commandPalette: '命令面板',
        search: '搜索会话',
        extensions: '扩展',
        terminal: '显示/隐藏终端',
        theme: '切换主题',
        window: '窗口',
        help: '帮助',
        changelog: '更新日志',
        fullScreen: '切换全屏',
        about: '关于 Nexus',
        openLink: '在浏览器中打开链接',
        copyLink: '复制链接'
      };

const sendCommand = (commandId: string): void => {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (window && !window.isDestroyed())
    window.webContents.send(IPC_CHANNELS.appMenuCommand, commandId);
};

/**
 * 安装产品化原生菜单；刷新与 DevTools 仅开发态出现。
 */
export const installApplicationMenu = (language: AppLanguage): void => {
  currentLanguage = language;
  app.setAboutPanelOptions({
    applicationName: 'Nexus',
    applicationVersion: app.getVersion(),
    version: app.getVersion(),
    copyright: 'Nexus',
    iconPath:
      app.isPackaged && process.resourcesPath
        ? join(process.resourcesPath, 'icon.png')
        : join(__dirname, '../../build/icon.png')
  });
  const text = labels(language);
  const isMac = process.platform === 'darwin';
  const command = (
    label: string,
    accelerator: string,
    commandId: string
  ): MenuItemConstructorOptions => ({
    label,
    accelerator,
    registerAccelerator: false,
    click: () => sendCommand(commandId)
  });

  const viewMenu: MenuItemConstructorOptions[] = [
    command(text.commandPalette, 'CmdOrCtrl+K', 'command.palette'),
    command(text.search, 'CmdOrCtrl+Shift+F', 'session.search'),
    command(text.extensions, 'CmdOrCtrl+Shift+E', 'extensions.open'),
    command(text.terminal, 'CmdOrCtrl+J', 'terminal.toggle'),
    command(text.theme, 'CmdOrCtrl+Shift+L', 'theme.toggle')
  ];
  viewMenu.push(
    { type: 'separator' },
    {
      label: text.fullScreen,
      accelerator: isMac ? 'Ctrl+Cmd+F' : 'F11',
      click: () => {
        const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
        if (window && !window.isDestroyed()) window.setFullScreen(!window.isFullScreen());
      }
    }
  );
  if (!app.isPackaged) {
    viewMenu.push(
      { type: 'separator' },
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' }
    );
  }

  const template: MenuItemConstructorOptions[] = [];
  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: text.settings,
          accelerator: 'CmdOrCtrl+,',
          click: () => sendCommand('settings.open')
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: text.quit }
      ]
    });
  }

  template.push(
    {
      label: text.file,
      submenu: [
        command(text.newSession, 'CmdOrCtrl+N', 'session.new'),
        ...(isMac
          ? []
          : ([
              { type: 'separator' },
              {
                label: text.settings,
                accelerator: 'CmdOrCtrl+,',
                registerAccelerator: false,
                click: () => sendCommand('settings.open')
              },
              { type: 'separator' },
              {
                label: text.quit,
                accelerator: 'CmdOrCtrl+Q',
                role: 'quit'
              }
            ] satisfies MenuItemConstructorOptions[])),
        { type: 'separator' },
        { label: text.close, role: 'close' }
      ]
    },
    {
      label: text.edit,
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    { label: text.view, submenu: viewMenu },
    {
      label: text.window,
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const }] : [])
      ]
    },
    {
      label: text.help,
      submenu: [
        ...(isMac
          ? []
          : ([
              { label: text.about, click: () => app.showAboutPanel() },
              { type: 'separator' }
            ] satisfies MenuItemConstructorOptions[])),
        { label: text.changelog, click: () => sendCommand('changelog.open') }
      ]
    }
  );

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

/**
 * 输入框与可选中文本使用原生编辑菜单，避免桌面应用缺少右键操作。
 */
export const installWindowContextMenu = (window: BrowserWindow): void => {
  window.webContents.on('context-menu', (_event, params) => {
    const text = labels(currentLanguage);
    const items: MenuItemConstructorOptions[] = [];
    if (params.linkURL) {
      if (/^https?:\/\//i.test(params.linkURL)) {
        items.push({
          label: text.openLink,
          click: () => {
            shell.openExternal(params.linkURL).catch(() => undefined);
          }
        });
      }
      items.push({
        label: text.copyLink,
        click: () => clipboard.writeText(params.linkURL)
      });
      if (params.isEditable || params.selectionText.trim()) items.push({ type: 'separator' });
    }
    if (params.isEditable) {
      items.push(
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { type: 'separator' },
        { role: 'selectAll' }
      );
    } else if (params.selectionText.trim()) {
      items.push({ role: 'copy' }, { role: 'selectAll' });
    }
    if (!items.length) return;
    Menu.buildFromTemplate(items).popup({ window });
  });
};
