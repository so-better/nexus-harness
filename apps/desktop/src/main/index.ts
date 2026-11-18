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
import { EventStore } from './services/session/event-store';
import { RunStore } from './services/session/run-store';
import { SessionService } from './services/session/session-service';
import { syncBuiltinPlugins } from './services/plugins/builtin-plugin-service';
import { initializeAutoLaunch } from './services/settings/startup-settings';

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
      await syncBuiltinPlugins({
        sourceDir: getBuiltinPluginsDirectory(),
        destinationDir: getAppDataPaths().plugins
      });
      nativeTheme.themeSource = await loadThemeSource();
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
      }

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

  app.on('will-quit', () => {
    closeDatabase();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
