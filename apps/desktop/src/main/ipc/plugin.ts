/**
 * 插件 IPC：列表、启停、重载、存储、设置与日志。
 */

import { BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { isSensitivePath } from '@nexus/tools';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { PluginPublic, PluginWorkspaceEntry } from '@shared/plugin';
import { fail, ok, type Result } from '@shared/ipc/result';
import { getPluginHost } from '../services/plugins/plugin-host-instance';
import { importPluginDirectory } from '../services/plugins/plugin-import-service';
import { getAppDataPaths } from '../services/storage/paths';
import { getDatabase } from '../services/storage/database';

const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

export const registerPluginIpc = (): void => {
  const host = getPluginHost();
  if (!host) return;

  host.onChange((plugins) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.pluginChanged, plugins);
    }
  });

  ipcMain.handle(IPC_CHANNELS.pluginList, (): Result<PluginPublic[]> => ok(host.list()));

  ipcMain.handle(
    IPC_CHANNELS.pluginSetEnabled,
    async (_event, rawInput: unknown): Promise<Result<PluginPublic[]>> => {
      if (!rawInput || typeof rawInput !== 'object')
        return fail('PLUGIN_INVALID_INPUT', '插件参数不合法');
      const { id, enabled } = rawInput as { id?: unknown; enabled?: unknown };
      if (!isString(id) || typeof enabled !== 'boolean') {
        return fail('PLUGIN_INVALID_INPUT', '插件参数不合法');
      }
      return ok(await host.setEnabled(id, enabled));
    }
  );

  ipcMain.handle(IPC_CHANNELS.pluginReload, async (): Promise<Result<PluginPublic[]>> => {
    return ok(await host.reload());
  });

  ipcMain.handle(IPC_CHANNELS.pluginImport, async (event): Promise<Result<PluginPublic[]>> => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: '导入插件文件夹',
      properties: ['openDirectory'] as Array<'openDirectory'>
    };
    const selected = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    if (selected.canceled || !selected.filePaths[0]) return ok(host.list());
    try {
      await importPluginDirectory({
        sourceDir: selected.filePaths[0],
        pluginsDir: getAppDataPaths().plugins
      });
      return ok(await host.reload());
    } catch (error) {
      return fail('PLUGIN_IMPORT_FAILED', error instanceof Error ? error.message : '导入插件失败');
    }
  });

  const sessionRoot = async (sessionId: string): Promise<string | undefined> => {
    const row = getDatabase()
      .prepare("SELECT path FROM session_roots WHERE session_id = ? AND kind = 'directory' LIMIT 1")
      .get(sessionId) as { path: string } | undefined;
    if (!row) return undefined;
    return realpath(row.path).catch(() => undefined);
  };

  const resolveWorkspacePath = async (
    sessionId: string,
    requestedPath: string
  ): Promise<string | undefined> => {
    const root = await sessionRoot(sessionId);
    if (!root) return undefined;
    try {
      const resolved = await realpath(
        isAbsolute(requestedPath) ? requestedPath : join(root, requestedPath)
      );
      if (resolved !== root && !resolved.startsWith(`${root}/`)) return undefined;
      if (isSensitivePath(resolved)) return undefined;
      return resolved;
    } catch {
      return undefined;
    }
  };

  const canReadWorkspace = (pluginId: string): boolean => {
    const plugin = host.list().find((item) => item.id === pluginId);
    return Boolean(plugin?.enabled && plugin.permissions.includes('workspace:read'));
  };

  const canUsePermission = (pluginId: string, permission: string): boolean => {
    const plugin = host.list().find((item) => item.id === pluginId);
    return Boolean(plugin?.enabled && plugin.permissions.includes(permission));
  };

  ipcMain.handle(
    IPC_CHANNELS.pluginWorkspaceRead,
    async (_event, rawInput: unknown): Promise<Result<string>> => {
      if (!rawInput || typeof rawInput !== 'object')
        return fail('PLUGIN_INVALID_INPUT', '插件工作区参数不合法');
      const { pluginId, sessionId, path } = rawInput as {
        pluginId?: unknown;
        sessionId?: unknown;
        path?: unknown;
      };
      if (
        !isString(pluginId) ||
        !isString(sessionId) ||
        !isString(path) ||
        !canReadWorkspace(pluginId)
      ) {
        return fail('PLUGIN_PERMISSION_DENIED', '缺少工作区读取权限');
      }
      const filePath = await resolveWorkspacePath(sessionId, path);
      if (!filePath) return fail('PLUGIN_PATH_DENIED', '路径不在会话工作区内');
      try {
        if ((await stat(filePath)).size > 1_000_000) {
          return fail('PLUGIN_FILE_TOO_LARGE', '文件超过 1MB 上限');
        }
        return ok(await readFile(filePath, 'utf8'));
      } catch (error) {
        return fail(
          'PLUGIN_WORKSPACE_FAILED',
          error instanceof Error ? error.message : '读取文件失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.pluginWorkspaceList,
    async (_event, rawInput: unknown): Promise<Result<PluginWorkspaceEntry[]>> => {
      if (!rawInput || typeof rawInput !== 'object')
        return fail('PLUGIN_INVALID_INPUT', '插件工作区参数不合法');
      const { pluginId, sessionId, path } = rawInput as {
        pluginId?: unknown;
        sessionId?: unknown;
        path?: unknown;
      };
      if (!isString(pluginId) || !isString(sessionId) || !canReadWorkspace(pluginId)) {
        return fail('PLUGIN_PERMISSION_DENIED', '缺少工作区读取权限');
      }
      const directory = await resolveWorkspacePath(sessionId, isString(path) ? path : '.');
      if (!directory) return fail('PLUGIN_PATH_DENIED', '路径不在会话工作区内');
      try {
        const entries = await readdir(directory, { withFileTypes: true });
        return ok(
          entries.map((entry) => ({
            name: entry.name,
            path: join(directory, entry.name),
            type: entry.isDirectory() ? ('directory' as const) : ('file' as const)
          }))
        );
      } catch (error) {
        return fail(
          'PLUGIN_WORKSPACE_FAILED',
          error instanceof Error ? error.message : '读取目录失败'
        );
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.pluginStorageGet, (_event, rawInput: unknown): Result<unknown> => {
    if (!rawInput || typeof rawInput !== 'object')
      return fail('PLUGIN_INVALID_INPUT', '插件存储参数不合法');
    const { pluginId, key } = rawInput as { pluginId?: unknown; key?: unknown };
    if (!isString(pluginId) || !isString(key))
      return fail('PLUGIN_INVALID_INPUT', '插件存储参数不合法');
    if (!canUsePermission(pluginId, 'storage')) {
      return fail('PLUGIN_PERMISSION_DENIED', '缺少 storage 权限');
    }
    return ok(host.getStorage(pluginId, key));
  });

  ipcMain.handle(
    IPC_CHANNELS.pluginStorageSet,
    (_event, rawInput: unknown): Result<{ ok: boolean }> => {
      if (!rawInput || typeof rawInput !== 'object')
        return fail('PLUGIN_INVALID_INPUT', '插件存储参数不合法');
      const { pluginId, key, value } = rawInput as {
        pluginId?: unknown;
        key?: unknown;
        value?: unknown;
      };
      if (!isString(pluginId) || !isString(key))
        return fail('PLUGIN_INVALID_INPUT', '插件存储参数不合法');
      if (!canUsePermission(pluginId, 'storage')) {
        return fail('PLUGIN_PERMISSION_DENIED', '缺少 storage 权限');
      }
      host.setStorage(pluginId, key, value);
      return ok({ ok: true });
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.pluginStorageDelete,
    (_event, rawInput: unknown): Result<{ ok: boolean }> => {
      if (!rawInput || typeof rawInput !== 'object')
        return fail('PLUGIN_INVALID_INPUT', '插件存储参数不合法');
      const { pluginId, key } = rawInput as { pluginId?: unknown; key?: unknown };
      if (!isString(pluginId) || !isString(key))
        return fail('PLUGIN_INVALID_INPUT', '插件存储参数不合法');
      if (!canUsePermission(pluginId, 'storage')) {
        return fail('PLUGIN_PERMISSION_DENIED', '缺少 storage 权限');
      }
      host.deleteStorage(pluginId, key);
      return ok({ ok: true });
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.pluginSettingsGet,
    (_event, pluginId: unknown): Result<Record<string, unknown>> => {
      if (!isString(pluginId)) return fail('PLUGIN_INVALID_INPUT', '插件 id 不合法');
      return ok(host.getSettings(pluginId));
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.pluginSettingsSet,
    (_event, rawInput: unknown): Result<Record<string, unknown>> => {
      if (!rawInput || typeof rawInput !== 'object')
        return fail('PLUGIN_INVALID_INPUT', '插件设置参数不合法');
      const { pluginId, values } = rawInput as { pluginId?: unknown; values?: unknown };
      if (!isString(pluginId) || !values || typeof values !== 'object' || Array.isArray(values)) {
        return fail('PLUGIN_INVALID_INPUT', '插件设置参数不合法');
      }
      const normalized: Record<string, string | number | boolean | null> = {};
      for (const [key, value] of Object.entries(values)) {
        if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
          return fail('PLUGIN_INVALID_INPUT', `设置项类型不合法：${key}`);
        }
        normalized[key] = value as string | number | boolean | null;
      }
      try {
        return ok(host.setSettings(pluginId, normalized));
      } catch (error) {
        return fail(
          'PLUGIN_SETTINGS_FAILED',
          error instanceof Error ? error.message : '保存插件设置失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.pluginUninstall,
    async (_event, pluginId: unknown): Promise<Result<PluginPublic[]>> => {
      if (!isString(pluginId)) return fail('PLUGIN_INVALID_INPUT', '插件 id 不合法');
      try {
        return ok(await host.uninstall(pluginId));
      } catch (error) {
        return fail(
          'PLUGIN_UNINSTALL_FAILED',
          error instanceof Error ? error.message : '卸载插件失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.pluginOpenDirectory,
    async (): Promise<Result<{ opened: boolean }>> => {
      const error = await shell.openPath(getAppDataPaths().plugins);
      if (error) return fail('PLUGIN_OPEN_DIRECTORY_FAILED', error);
      return ok({ opened: true });
    }
  );

  ipcMain.handle(IPC_CHANNELS.pluginLog, (_event, rawInput: unknown): Result<{ ok: boolean }> => {
    if (!rawInput || typeof rawInput !== 'object')
      return fail('PLUGIN_INVALID_INPUT', '插件日志参数不合法');
    const { pluginId, level, message } = rawInput as {
      pluginId?: unknown;
      level?: unknown;
      message?: unknown;
    };
    if (!isString(pluginId) || !isString(message))
      return fail('PLUGIN_INVALID_INPUT', '插件日志参数不合法');
    host.log(pluginId, typeof level === 'string' ? level : 'info', message);
    return ok({ ok: true });
  });

  ipcMain.handle(
    IPC_CHANNELS.pluginNotify,
    (_event, rawInput: unknown): Result<{ ok: boolean }> => {
      if (!rawInput || typeof rawInput !== 'object')
        return fail('PLUGIN_INVALID_INPUT', '插件通知参数不合法');
      const { pluginId, message } = rawInput as { pluginId?: unknown; message?: unknown };
      if (!isString(pluginId) || !isString(message))
        return fail('PLUGIN_INVALID_INPUT', '插件通知参数不合法');
      if (Notification?.isSupported?.()) {
        new Notification({ title: pluginId, body: message }).show();
      }
      return ok({ ok: true });
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.pluginReportError,
    (_event, rawInput: unknown): Result<{ ok: boolean }> => {
      if (!rawInput || typeof rawInput !== 'object')
        return fail('PLUGIN_INVALID_INPUT', '插件错误参数不合法');
      const { pluginId, error } = rawInput as { pluginId?: unknown; error?: unknown };
      if (!isString(pluginId) || typeof error !== 'string')
        return fail('PLUGIN_INVALID_INPUT', '插件错误参数不合法');
      host.reportError(pluginId, error);
      return ok({ ok: true });
    }
  );
};
