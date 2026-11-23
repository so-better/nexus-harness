/**
 * 插件 IPC：列表、启停、重载、存储、设置与日志。
 */

import { BrowserWindow, dialog, ipcMain, Notification } from 'electron';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { isSensitivePath } from '@nexus/runtime-utils';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import {
  pluginIdSchema,
  pluginLogInputSchema,
  pluginNotifyInputSchema,
  pluginReportErrorInputSchema,
  pluginSetEnabledInputSchema,
  pluginSettingsSetInputSchema,
  pluginStorageInputSchema,
  pluginStorageSetInputSchema,
  pluginWorkspaceListInputSchema,
  pluginWorkspaceReadInputSchema,
  type PluginPublic,
  type PluginWorkspaceEntry
} from '@shared/plugin';
import { fail, ok, type Result } from '@shared/ipc/result';
import { getPluginHost } from '../services/plugins/plugin-host-instance';
import { importPluginDirectory } from '../services/plugins/plugin-import-service';
import { getAppDataPaths } from '../services/storage/paths';
import { getDatabase } from '../services/storage/database';

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
      const parsed = pluginSetEnabledInputSchema.safeParse(rawInput);
      if (!parsed.success) return fail('PLUGIN_INVALID_INPUT', '插件参数不合法');
      return ok(await host.setEnabled(parsed.data.id, parsed.data.enabled));
    }
  );

  ipcMain.handle(IPC_CHANNELS.pluginReload, async (): Promise<Result<PluginPublic[]>> => {
    return ok(await host.reload());
  });

  ipcMain.handle(
    IPC_CHANNELS.pluginImport,
    async (event): Promise<Result<PluginPublic[] | null>> => {
      const window = BrowserWindow.fromWebContents(event.sender);
      const options = {
        title: '导入插件文件夹',
        properties: ['openDirectory', 'multiSelections'] as Array<
          'openDirectory' | 'multiSelections'
        >
      };
      const selected = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);
      if (selected.canceled || !selected.filePaths[0]) return ok(null);
      let firstError: unknown;
      let imported = 0;
      for (const sourceDir of selected.filePaths) {
        try {
          await importPluginDirectory({
            sourceDir,
            pluginsDir: getAppDataPaths().plugins,
            hostVersion: host.getHostVersion()
          });
          imported += 1;
        } catch (error) {
          firstError ??= error;
        }
      }
      if (imported === 0 && firstError) {
        return fail(
          'PLUGIN_IMPORT_FAILED',
          firstError instanceof Error ? firstError.message : '导入插件失败'
        );
      }
      return ok(await host.reload());
    }
  );

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
      const parsed = pluginWorkspaceReadInputSchema.safeParse(rawInput);
      if (!parsed.success) return fail('PLUGIN_INVALID_INPUT', '插件工作区参数不合法');
      const { pluginId, sessionId, path } = parsed.data;
      if (!canReadWorkspace(pluginId)) {
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
      const parsed = pluginWorkspaceListInputSchema.safeParse(rawInput);
      if (!parsed.success) return fail('PLUGIN_INVALID_INPUT', '插件工作区参数不合法');
      const { pluginId, sessionId, path } = parsed.data;
      if (!canReadWorkspace(pluginId)) {
        return fail('PLUGIN_PERMISSION_DENIED', '缺少工作区读取权限');
      }
      const directory = await resolveWorkspacePath(sessionId, path ?? '.');
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
    const parsed = pluginStorageInputSchema.safeParse(rawInput);
    if (!parsed.success) return fail('PLUGIN_INVALID_INPUT', '插件存储参数不合法');
    const { pluginId, key } = parsed.data;
    if (!canUsePermission(pluginId, 'storage')) {
      return fail('PLUGIN_PERMISSION_DENIED', '缺少 storage 权限');
    }
    return ok(host.getStorage(pluginId, key));
  });

  ipcMain.handle(
    IPC_CHANNELS.pluginStorageSet,
    (_event, rawInput: unknown): Result<{ ok: boolean }> => {
      const parsed = pluginStorageSetInputSchema.safeParse(rawInput);
      if (!parsed.success) return fail('PLUGIN_INVALID_INPUT', '插件存储参数不合法');
      const { pluginId, key, value } = parsed.data;
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
      const parsed = pluginStorageInputSchema.safeParse(rawInput);
      if (!parsed.success) return fail('PLUGIN_INVALID_INPUT', '插件存储参数不合法');
      const { pluginId, key } = parsed.data;
      if (!canUsePermission(pluginId, 'storage')) {
        return fail('PLUGIN_PERMISSION_DENIED', '缺少 storage 权限');
      }
      host.deleteStorage(pluginId, key);
      return ok({ ok: true });
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.pluginSettingsGet,
    (_event, rawPluginId: unknown): Result<Record<string, unknown>> => {
      const parsed = pluginIdSchema.safeParse(rawPluginId);
      if (!parsed.success) return fail('PLUGIN_INVALID_INPUT', '插件 id 不合法');
      return ok(host.getSettings(parsed.data));
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.pluginSettingsSet,
    (_event, rawInput: unknown): Result<Record<string, unknown>> => {
      const parsed = pluginSettingsSetInputSchema.safeParse(rawInput);
      if (!parsed.success) return fail('PLUGIN_INVALID_INPUT', '插件设置参数不合法');
      try {
        return ok(host.setSettings(parsed.data.pluginId, parsed.data.values));
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
    async (_event, rawPluginId: unknown): Promise<Result<PluginPublic[]>> => {
      const parsed = pluginIdSchema.safeParse(rawPluginId);
      if (!parsed.success) return fail('PLUGIN_INVALID_INPUT', '插件 id 不合法');
      try {
        return ok(await host.uninstall(parsed.data));
      } catch (error) {
        return fail(
          'PLUGIN_UNINSTALL_FAILED',
          error instanceof Error ? error.message : '卸载插件失败'
        );
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.pluginLog, (_event, rawInput: unknown): Result<{ ok: boolean }> => {
    const parsed = pluginLogInputSchema.safeParse(rawInput);
    if (!parsed.success) return fail('PLUGIN_INVALID_INPUT', '插件日志参数不合法');
    host.log(parsed.data.pluginId, parsed.data.level, parsed.data.message);
    return ok({ ok: true });
  });

  ipcMain.handle(
    IPC_CHANNELS.pluginNotify,
    (_event, rawInput: unknown): Result<{ ok: boolean }> => {
      const parsed = pluginNotifyInputSchema.safeParse(rawInput);
      if (!parsed.success) return fail('PLUGIN_INVALID_INPUT', '插件通知参数不合法');
      if (Notification?.isSupported?.()) {
        new Notification({ title: parsed.data.pluginId, body: parsed.data.message }).show();
      }
      return ok({ ok: true });
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.pluginReportError,
    (_event, rawInput: unknown): Result<{ ok: boolean }> => {
      const parsed = pluginReportErrorInputSchema.safeParse(rawInput);
      if (!parsed.success) return fail('PLUGIN_INVALID_INPUT', '插件错误参数不合法');
      host.reportError(parsed.data.pluginId, parsed.data.error);
      return ok({ ok: true });
    }
  );
};
