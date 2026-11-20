/**
 * 设置 IPC：开机自启、缓存统计与清理。
 */

import { BrowserWindow, dialog, ipcMain, session } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import {
  cacheInfoSchema,
  cacheTargetSchema,
  languageSchema,
  notificationBadgeStyleSchema,
  type AppLanguage,
  type CacheInfo,
  type NotificationBadgeStyle
} from '@shared/ipc/contracts';
import { pluginSkinSelectionSchema, type PluginSkinSelection } from '@shared/plugin';
import { fail, ok, type Result } from '@shared/ipc/result';
import { imageSettingsSchema, type ImageSettings } from '@shared/image';
import { searchSettingsSchema, type SearchSettings } from '@shared/search';
import {
  applyAutoLaunch,
  loadAutoLaunch,
  saveAutoLaunch
} from '../services/settings/startup-settings';
import { loadLanguage, saveLanguage } from '../services/settings/language-settings';
import {
  setNotificationLanguage,
  setNotificationBadgeStyle
} from '../services/notifications/notification-service';
import {
  loadNotificationBadge,
  saveNotificationBadge
} from '../services/settings/notification-settings';
import { loadSkinSelection, saveSkinSelection } from '../services/settings/skin-settings';
import { loadImageSettings, saveImageSettings } from '../services/settings/image-settings';
import { loadSearchSettings, saveSearchSettings } from '../services/settings/search-settings';
import { clearCache, getCacheInfo } from '../services/cache/cache-service';
import { getAppDataPaths } from '../services/storage/paths';
import { hasActiveRuns } from '../services/agent/run-registry';
import { getDatabase } from '../services/storage/database';
import { createBackup, getBackupStatus, stageBackup } from '../services/settings/backup-service';

/**
 * 注册设置与缓存处理器。
 */
export const registerSettingsIpc = (): void => {
  const db = getDatabase();
  const paths = getAppDataPaths();

  ipcMain.handle(IPC_CHANNELS.settingsGetAutoLaunch, async (): Promise<Result<boolean>> => {
    try {
      return ok(await loadAutoLaunch());
    } catch (error) {
      return fail('SETTINGS_READ_FAILED', error instanceof Error ? error.message : '读取设置失败');
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.settingsSetAutoLaunch,
    async (_event, rawEnabled: unknown): Promise<Result<boolean>> => {
      if (typeof rawEnabled !== 'boolean') {
        return fail('SETTINGS_INVALID_INPUT', '开机自启参数不合法');
      }

      try {
        const applied = applyAutoLaunch(rawEnabled);
        await saveAutoLaunch(applied);
        return ok(applied);
      } catch (error) {
        return fail(
          'SETTINGS_WRITE_FAILED',
          error instanceof Error ? error.message : '保存设置失败'
        );
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.settingsGetLanguage, async (): Promise<Result<AppLanguage>> => {
    try {
      return ok(await loadLanguage());
    } catch (error) {
      return fail('SETTINGS_READ_FAILED', error instanceof Error ? error.message : '读取语言失败');
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.settingsSetLanguage,
    async (_event, rawLanguage: unknown): Promise<Result<AppLanguage>> => {
      const parsed = languageSchema.safeParse(rawLanguage);
      if (!parsed.success) return fail('SETTINGS_INVALID_INPUT', '语言参数不合法');

      try {
        await saveLanguage(parsed.data);
        setNotificationLanguage(parsed.data);
        return ok(parsed.data);
      } catch (error) {
        return fail(
          'SETTINGS_WRITE_FAILED',
          error instanceof Error ? error.message : '保存语言失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.settingsGetNotificationBadge,
    async (): Promise<Result<NotificationBadgeStyle>> => {
      try {
        return ok(await loadNotificationBadge());
      } catch (error) {
        return fail(
          'SETTINGS_READ_FAILED',
          error instanceof Error ? error.message : '读取通知设置失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.settingsSetNotificationBadge,
    async (_event, rawStyle: unknown): Promise<Result<NotificationBadgeStyle>> => {
      const parsed = notificationBadgeStyleSchema.safeParse(rawStyle);
      if (!parsed.success) return fail('SETTINGS_INVALID_INPUT', '通知角标参数不合法');
      try {
        const saved = await saveNotificationBadge(parsed.data);
        setNotificationBadgeStyle(saved);
        return ok(saved);
      } catch (error) {
        return fail(
          'SETTINGS_WRITE_FAILED',
          error instanceof Error ? error.message : '保存通知设置失败'
        );
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.settingsGetImage, async (): Promise<Result<ImageSettings | null>> => {
    try {
      return ok(await loadImageSettings());
    } catch (error) {
      return fail(
        'SETTINGS_READ_FAILED',
        error instanceof Error ? error.message : '读取图像模型配置失败'
      );
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.settingsSetImage,
    async (_event, rawValue: unknown): Promise<Result<ImageSettings>> => {
      const parsed = imageSettingsSchema.safeParse(rawValue);
      if (!parsed.success) return fail('SETTINGS_INVALID_INPUT', '图像模型配置不合法');
      try {
        return ok(await saveImageSettings(parsed.data));
      } catch (error) {
        return fail(
          'SETTINGS_WRITE_FAILED',
          error instanceof Error ? error.message : '保存图像模型配置失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.settingsGetSearch,
    async (): Promise<Result<SearchSettings | null>> => {
      try {
        return ok(await loadSearchSettings());
      } catch (error) {
        return fail(
          'SETTINGS_READ_FAILED',
          error instanceof Error ? error.message : '读取搜索配置失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.settingsSetSearch,
    async (_event, rawValue: unknown): Promise<Result<SearchSettings>> => {
      const parsed = searchSettingsSchema.safeParse(rawValue);
      if (!parsed.success) return fail('SETTINGS_INVALID_INPUT', '搜索配置不合法');
      try {
        return ok(await saveSearchSettings(parsed.data));
      } catch (error) {
        return fail(
          'SETTINGS_WRITE_FAILED',
          error instanceof Error ? error.message : '保存搜索配置失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.settingsGetSkin,
    async (): Promise<Result<PluginSkinSelection | null>> => {
      try {
        return ok(await loadSkinSelection());
      } catch (error) {
        return fail(
          'SETTINGS_READ_FAILED',
          error instanceof Error ? error.message : '读取皮肤设置失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.settingsSetSkin,
    async (_event, rawSelection: unknown): Promise<Result<PluginSkinSelection | null>> => {
      if (rawSelection !== null && !pluginSkinSelectionSchema.safeParse(rawSelection).success) {
        return fail('SETTINGS_INVALID_INPUT', '皮肤参数不合法');
      }
      try {
        return ok(await saveSkinSelection(rawSelection as PluginSkinSelection | null));
      } catch (error) {
        return fail(
          'SETTINGS_WRITE_FAILED',
          error instanceof Error ? error.message : '保存皮肤设置失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.settingsExportBackup,
    async (event): Promise<Result<{ path: string } | null>> => {
      if (hasActiveRuns()) return fail('BACKUP_BUSY', '有运行中的任务，暂不能导出数据');
      const window = BrowserWindow.fromWebContents(event.sender);
      const defaultPath = `nexus-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      const selected = window
        ? await dialog.showSaveDialog(window, {
            title: '导出 Nexus 数据备份',
            defaultPath,
            filters: [{ name: 'Nexus 备份', extensions: ['zip'] }]
          })
        : await dialog.showSaveDialog({
            title: '导出 Nexus 数据备份',
            defaultPath,
            filters: [{ name: 'Nexus 备份', extensions: ['zip'] }]
          });
      if (selected.canceled || !selected.filePath) {
        return ok(null);
      }
      const destination = selected.filePath.toLowerCase().endsWith('.zip')
        ? selected.filePath
        : `${selected.filePath}.zip`;
      try {
        return ok(await createBackup(db, destination, paths));
      } catch (error) {
        return fail(
          'BACKUP_EXPORT_FAILED',
          error instanceof Error ? error.message : '导出数据失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.settingsBackupStatus,
    async (): Promise<Result<{ pendingRestore: boolean }>> => {
      try {
        return ok(await getBackupStatus(paths));
      } catch (error) {
        return fail(
          'BACKUP_STATUS_FAILED',
          error instanceof Error ? error.message : '读取备份状态失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.settingsImportBackup,
    async (event): Promise<Result<{ path: string; restartRequired: true } | null>> => {
      if (hasActiveRuns()) return fail('BACKUP_BUSY', '有运行中的任务，暂不能导入数据');
      const window = BrowserWindow.fromWebContents(event.sender);
      const selected = window
        ? await dialog.showOpenDialog(window, {
            title: '选择 Nexus 数据备份',
            properties: ['openFile'],
            filters: [{ name: 'Nexus 备份', extensions: ['zip'] }]
          })
        : await dialog.showOpenDialog({
            title: '选择 Nexus 数据备份',
            properties: ['openFile'],
            filters: [{ name: 'Nexus 备份', extensions: ['zip'] }]
          });
      if (selected.canceled || !selected.filePaths[0]) {
        return ok(null);
      }
      try {
        const result = await stageBackup(selected.filePaths[0], paths);
        return ok({ path: result.path, restartRequired: true });
      } catch (error) {
        return fail(
          'BACKUP_IMPORT_FAILED',
          error instanceof Error ? error.message : '导入数据失败'
        );
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.cacheGetInfo, async (): Promise<Result<CacheInfo>> => {
    try {
      return ok(
        await getCacheInfo({ files: paths.files, artifacts: paths.artifacts, logs: paths.logs })
      );
    } catch (error) {
      return fail('CACHE_INFO_FAILED', error instanceof Error ? error.message : '读取缓存失败');
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.cacheClear,
    async (_event, rawTarget: unknown): Promise<Result<CacheInfo>> => {
      const parsed = cacheTargetSchema.safeParse(rawTarget);
      if (!parsed.success) {
        return fail('CACHE_INVALID_TARGET', '缓存清理参数不合法', parsed.error.flatten());
      }
      if (hasActiveRuns()) {
        return fail('CACHE_BUSY', '有运行中的任务，暂不能清理缓存');
      }

      try {
        const info = await clearCache(
          { files: paths.files, artifacts: paths.artifacts, logs: paths.logs },
          parsed.data
        );
        if ((parsed.data === 'files' || parsed.data === 'all') && !info.failed.includes('files')) {
          db.prepare('DELETE FROM files').run();
        }
        if (
          (parsed.data === 'artifacts' || parsed.data === 'all') &&
          !info.failed.includes('artifacts')
        ) {
          db.prepare('DELETE FROM artifacts').run();
        }
        if (parsed.data === 'all') {
          try {
            await session.defaultSession.clearCache();
          } catch (error) {
            console.error('清理浏览器缓存失败', error);
          }
        }
        return ok(cacheInfoSchema.parse(info));
      } catch (error) {
        return fail('CACHE_CLEAR_FAILED', error instanceof Error ? error.message : '清理缓存失败');
      }
    }
  );
};
