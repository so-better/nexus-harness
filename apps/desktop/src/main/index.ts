/**
 * Electron 主进程入口：单实例、窗口生命周期与 IPC 注册。
 */

import { app, BrowserWindow, nativeTheme, protocol } from 'electron';
import { watch, type FSWatcher } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createNexusEvent } from '@nexus/core';
import { existsSync } from 'node:fs';
import { createMainWindow } from './app/create-window';
import { registerIpcHandlers } from './ipc';
import {
  ensureAppDataDirectories,
  getAppDataPaths,
  getBuiltinMcpConfigPath,
  getBuiltinPluginsDirectory,
  getBuiltinSkillsDirectory
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
import { syncBuiltinMcpConfig } from './services/mcp/builtin-mcp-service';
import { syncBuiltinSkills } from './services/skills/builtin-skill-service';
import { disposeMcpService, getMcpService } from './services/mcp/mcp-service-instance';
import { initializeAutoLaunch } from './services/settings/startup-settings';
import { applyPendingRestore } from './services/settings/backup-service';
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

let mcpConfigWatcher: FSWatcher | undefined;
let mcpReloadTimer: ReturnType<typeof setTimeout> | undefined;
let mcpReloadChain: Promise<void> = Promise.resolve();

/**
 * 重新加载 MCP；配置变化后释放旧连接并后台预热，避免发送时等待。
 */
const reloadMcp = (): void => {
  mcpReloadChain = mcpReloadChain
    .catch(() => undefined)
    .then(async () => {
      await disposeMcpService();
      await getMcpService().prewarm();
    })
    .catch((error: unknown) => console.error('MCP 重新加载失败', error));
};

/**
 * 监听 mcp.json 的外部修改；状态文件与测试结果不会触发重载。
 */
const startMcpConfigWatcher = (): void => {
  try {
    mcpConfigWatcher = watch(getAppDataPaths().mcp, { persistent: false }, (_event, filename) => {
      if (filename !== 'mcp.json') return;
      if (mcpReloadTimer) clearTimeout(mcpReloadTimer);
      mcpReloadTimer = setTimeout(reloadMcp, 300);
    });
    mcpConfigWatcher.on('error', (error) => console.error('MCP 配置监听失败', error));
  } catch (error) {
    console.error('MCP 配置监听启动失败', error);
  }
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
      await applyPendingRestore(getAppDataPaths());
      await syncBuiltinMcpConfig(getBuiltinMcpConfigPath(), getAppDataPaths().mcp).catch(
        (error: unknown) => {
          // 内置模板同步失败不能阻断应用启动，用户已有 MCP 配置仍然可用
          console.error('内置 MCP 模板同步失败', error);
        }
      );
      await syncBuiltinSkills({
        sourceDir: getBuiltinSkillsDirectory(),
        destinationDir: getAppDataPaths().skills
      }).catch((error: unknown) => {
        console.error('内置 Skill 同步失败', error);
      });
      startMcpConfigWatcher();
      // 启动后预热已启用的 MCP，避免第一次对话等待进程启动
      getMcpService()
        .prewarm()
        .catch((error: unknown) => console.error('MCP 预热失败', error));
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
    mcpConfigWatcher?.close();
    if (mcpReloadTimer) clearTimeout(mcpReloadTimer);
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
