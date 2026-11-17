/* Electron 主进程入口：单实例、窗口生命周期与 IPC 注册。 */

import { app, BrowserWindow, nativeTheme } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createMainWindow } from './app/create-window';
import { registerIpcHandlers } from './ipc';
import { ensureAppDataDirectories } from './services/storage/paths';
import { loadThemeSource } from './services/settings/theme-settings';

app.setName('Nexus');

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) return;

    if (window.isMinimized()) window.restore();
    window.focus();
  });

  app
    .whenReady()
    .then(async () => {
      await ensureAppDataDirectories();
      nativeTheme.themeSource = await loadThemeSource();

      if (process.platform === 'darwin' && !app.isPackaged) {
        const devIcon = join(__dirname, '../../build/icon.png');
        if (existsSync(devIcon)) app.dock?.setIcon(devIcon);
      }

      registerIpcHandlers();
      createMainWindow();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          createMainWindow();
        }
      });
    })
    .catch((error: unknown) => {
      console.error('应用启动失败', error);
      app.quit();
    });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
