/**
 * Electron 主进程入口：单实例、窗口生命周期与 IPC 注册。
 */

import { app, BrowserWindow, nativeTheme, protocol } from 'electron';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createNexusEvent } from '@nexus/core';
import { existsSync } from 'node:fs';
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
import { disposeMcpService } from './services/mcp/mcp-service-instance';
import { initializeAutoLaunch } from './services/settings/startup-settings';
import { terminalService } from './services/terminal/terminal-service';
import { PluginHost } from './services/plugins/plugin-host';
import { getPluginHost, setPluginHost } from './services/plugins/plugin-host-instance';

app.setName('Nexus');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'nexus-plugin',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true
    }
  }
]);

const pluginMime = (path: string): string => {
  switch (extname(path).toLowerCase()) {
    case '.js':
    case '.mjs':
      return 'text/javascript';
    case '.css':
      return 'text/css';
    case '.json':
      return 'application/json';
    case '.png':
      return 'image/png';
    case '.svg':
      return 'image/svg+xml';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.woff2':
      return 'font/woff2';
    default:
      return 'application/octet-stream';
  }
};

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
      const builtinIds = new Set(
        await syncBuiltinPlugins({
          sourceDir: getBuiltinPluginsDirectory(),
          destinationDir: getAppDataPaths().plugins
        })
      );
      nativeTheme.themeSource = await loadThemeSource();
      setNotificationLanguage(await loadLanguage());
      setNotificationBadgeStyle(await loadNotificationBadge());
      await initializeAutoLaunch();

      const db = initDatabase();
      const runStore = new RunStore(db);
      const eventStore = new EventStore(db);
      const sessions = new SessionService(db, eventStore);
      const pluginHost = new PluginHost({
        db,
        directory: getAppDataPaths().plugins,
        builtinIds
      });
      setPluginHost(pluginHost);
      await pluginHost.scan();
      protocol.handle('nexus-plugin', async (request) => {
        const url = new URL(request.url);
        const pluginId = url.hostname;
        const relativePath = decodeURIComponent(url.pathname.replace(/^\//, ''));
        const filePath = await pluginHost.getRendererFile(pluginId, relativePath);
        if (!filePath) return new Response('Plugin file not found', { status: 404 });
        const content = await readFile(filePath);
        return new Response(new Uint8Array(content), {
          headers: {
            'content-type': pluginMime(filePath),
            'access-control-allow-origin': '*',
            'cross-origin-resource-policy': 'cross-origin'
          }
        });
      });
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
    getPluginHost()
      ?.dispose()
      .catch((error: unknown) => {
        console.error('插件宿主关闭失败', error);
      });
    terminalService.disposeAll();
    disposeMcpService().catch((error: unknown) => {
      console.error('MCP 关闭失败', error);
    });
    closeDatabase();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
