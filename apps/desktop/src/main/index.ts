/**
 * Electron 主进程入口：单实例、窗口生命周期与 IPC 注册。
 */

import { app, BrowserWindow, nativeTheme } from 'electron';
import { createNexusEvent } from '@nexus/core';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createMainWindow } from './app/create-window';
import { registerIpcHandlers } from './ipc';
import {
  ensureAppDataDirectories,
  getAppDataPaths,
  getBuiltinPluginsDirectory
} from './services/storage/paths';
import { closeDatabase, initDatabase } from './services/storage/database';
import { loadThemeSource } from './services/settings/theme-settings';
import { loadLanguage } from './services/settings/language-settings';
import {
  clearNotificationBadge,
  setNotificationBadgeStyle,
  setNotificationLanguage
} from './services/notifications/notification-service';
import { loadNotificationBadge } from './services/settings/notification-settings';
import { EventStore } from './services/session/event-store';
import { RunStore } from './services/session/run-store';
import { expirePendingApprovals } from './services/session/approval-recovery';
import { SessionService } from './services/session/session-service';
import { syncBuiltinPlugins } from './services/plugins/builtin-plugin-service';
import { initializeAutoLaunch } from './services/settings/startup-settings';
import { terminalService } from './services/terminal/terminal-service';

app.setName('Nexus');

/**
 * 统一初始化主窗口的焦点与终端生命周期监听。
 */
const setupMainWindow = (window: BrowserWindow): BrowserWindow => {
  window.on('focus', clearNotificationBadge);
  const terminalOwnerId = window.webContents.id;
  window.webContents.once('destroyed', () => {
    terminalService.closeByOwner(terminalOwnerId);
  });
  return window;
};

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
      await syncBuiltinPlugins({
        sourceDir: getBuiltinPluginsDirectory(),
        destinationDir: getAppDataPaths().plugins
      });
      nativeTheme.themeSource = await loadThemeSource();
      setNotificationLanguage(await loadLanguage());
      setNotificationBadgeStyle(await loadNotificationBadge());
      await initializeAutoLaunch();

      const db = initDatabase();
      const runStore = new RunStore(db);
      const eventStore = new EventStore(db);
      const sessions = new SessionService(db, eventStore);
      for (const run of runStore.markInterrupted()) {
        sessions.setStatus(run.session_id, 'interrupted');
        eventStore.append(
          createNexusEvent({
            sessionId: run.session_id,
            runId: run.id,
            seq: 1,
            type: 'run.interrupted',
            payload: { reason: 'app_restart' }
          })
        );
        expirePendingApprovals(eventStore, run);
      }

      if (process.platform === 'darwin' && !app.isPackaged) {
        const devIcon = join(__dirname, '../../build/icon.png');
        if (existsSync(devIcon)) app.dock?.setIcon(devIcon);
      }

      registerIpcHandlers();
      setupMainWindow(createMainWindow());

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          setupMainWindow(createMainWindow());
        }
      });
    })
    .catch((error: unknown) => {
      console.error('应用启动失败', error);
      app.quit();
    });

  app.on('will-quit', () => {
    terminalService.disposeAll();
    closeDatabase();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
