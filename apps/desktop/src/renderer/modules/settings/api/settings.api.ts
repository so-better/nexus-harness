/**
 * 设置 API：Provider、主题与应用信息，组件不直接访问 nexus。
 */

import { nexus } from '@/app/nexus-bridge';
import type {
  AppInfo,
  CacheInfo,
  CacheTarget,
  AppLanguage,
  ProviderProbeResult,
  ProviderPublic,
  ProviderTestInput,
  ProviderSettings,
  ThemeInfo,
  ThemeSource
} from '@shared/ipc/contracts';
import { unwrap } from '@/app/ipc';

/**
 * 读取应用版本信息。
 */
export const getAppInfo = async (): Promise<AppInfo> => unwrap(await nexus.app.getInfo());

/**
 * 读取 Provider 配置。
 */
export const listProviders = async (): Promise<ProviderPublic[]> =>
  unwrap(await nexus.provider.list());

/**
 * 保存 Provider 配置。
 */
export const saveProvider = async (input: ProviderSettings): Promise<ProviderPublic> =>
  unwrap(await nexus.provider.save(input));

/**
 * 删除 Provider 配置。
 */
export const removeProvider = async (id: string): Promise<void> => {
  unwrap(await nexus.provider.remove(id));
};

/**
 * 读取当前主题来源。
 */
export const getThemeInfo = async (): Promise<ThemeInfo> => unwrap(await nexus.theme.getInfo());

/**
 * 设置主题来源。
 */
export const setThemeSource = async (source: ThemeSource): Promise<ThemeInfo> =>
  unwrap(await nexus.theme.setSource(source));

/**
 * 读取开机自启设置。
 */
export const getAutoLaunch = async (): Promise<boolean> =>
  unwrap(await nexus.settings.getAutoLaunch());

/**
 * 保存开机自启设置。
 */
export const setAutoLaunch = async (enabled: boolean): Promise<boolean> =>
  unwrap(await nexus.settings.setAutoLaunch(enabled));

/**
 * 读取缓存占用。
 */
export const getCacheInfo = async (): Promise<CacheInfo> => unwrap(await nexus.cache.getInfo());

/**
 * 清理缓存。
 */
export const clearCache = async (target: CacheTarget): Promise<CacheInfo> =>
  unwrap(await nexus.cache.clear(target));

/**
 * 测试 Provider 连接并获取模型列表。
 */
export const testProvider = async (input: ProviderTestInput): Promise<ProviderProbeResult> =>
  unwrap(await nexus.provider.test(input));

/**
 * 读取界面语言。
 */
export const getLanguage = async (): Promise<AppLanguage> =>
  unwrap(await nexus.settings.getLanguage());

/**
 * 保存界面语言。
 */
export const setLanguage = async (language: AppLanguage): Promise<AppLanguage> =>
  unwrap(await nexus.settings.setLanguage(language));

import type {
  NotificationBadgeStyle,
  TerminalSettings,
  TerminalShellInfo
} from '@shared/ipc/contracts';

/**
 * 读取终端外观与 shell 设置。
 */
export const getTerminalSettings = async (): Promise<TerminalSettings> =>
  unwrap(await nexus.terminal.getSettings());

/**
 * 保存终端外观与 shell 设置。
 */
export const getTerminalShellInfo = async (): Promise<TerminalShellInfo> =>
  unwrap(await nexus.terminal.getShellInfo());

export const selectTerminalShell = async (): Promise<string | undefined> =>
  unwrap(await nexus.terminal.selectShell()).path;

export const setTerminalSettings = async (settings: TerminalSettings): Promise<TerminalSettings> =>
  unwrap(await nexus.terminal.setSettings(settings));

/**
 * 读取通知角标样式。
 */
export const getNotificationBadge = async (): Promise<NotificationBadgeStyle> =>
  unwrap(await nexus.settings.getNotificationBadge());

/**
 * 保存通知角标样式。
 */
export const setNotificationBadge = async (
  style: NotificationBadgeStyle
): Promise<NotificationBadgeStyle> => unwrap(await nexus.settings.setNotificationBadge(style));
