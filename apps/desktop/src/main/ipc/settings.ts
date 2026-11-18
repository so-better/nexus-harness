/**
 * 设置 IPC：开机自启、缓存统计与清理。
 */

import { ipcMain, session } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import {
  cacheInfoSchema,
  cacheTargetSchema,
  languageSchema,
  type AppLanguage,
  type CacheInfo
} from '@shared/ipc/contracts';
import { fail, ok, type Result } from '@shared/ipc/result';
import {
  applyAutoLaunch,
  loadAutoLaunch,
  saveAutoLaunch
} from '../services/settings/startup-settings';
import { loadLanguage, saveLanguage } from '../services/settings/language-settings';
import { clearCache, getCacheInfo } from '../services/cache/cache-service';
import { getAppDataPaths } from '../services/storage/paths';
import { hasActiveRuns } from '../services/agent/run-registry';
import { getDatabase } from '../services/storage/database';

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
        return ok(parsed.data);
      } catch (error) {
        return fail(
          'SETTINGS_WRITE_FAILED',
          error instanceof Error ? error.message : '保存语言失败'
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
