/**
 * 设置 API：Provider、主题与应用信息，组件不直接访问 window.nexus。
 */

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
export const getAppInfo = async (): Promise<AppInfo> => unwrap(await window.nexus.app.getInfo());

/**
 * 读取 Provider 配置。
 */
export const listProviders = async (): Promise<ProviderPublic[]> =>
  unwrap(await window.nexus.provider.list());

/**
 * 保存 Provider 配置。
 */
export const saveProvider = async (input: ProviderSettings): Promise<ProviderPublic> =>
  unwrap(await window.nexus.provider.save(input));

/**
 * 删除 Provider 配置。
 */
export const removeProvider = async (id: string): Promise<void> => {
  unwrap(await window.nexus.provider.remove(id));
};

/**
 * 读取当前主题来源。
 */
export const getThemeInfo = async (): Promise<ThemeInfo> =>
  unwrap(await window.nexus.theme.getInfo());

/**
 * 设置主题来源。
 */
export const setThemeSource = async (source: ThemeSource): Promise<ThemeInfo> =>
  unwrap(await window.nexus.theme.setSource(source));

/**
 * 读取开机自启设置。
 */
export const getAutoLaunch = async (): Promise<boolean> =>
  unwrap(await window.nexus.settings.getAutoLaunch());

/**
 * 保存开机自启设置。
 */
export const setAutoLaunch = async (enabled: boolean): Promise<boolean> =>
  unwrap(await window.nexus.settings.setAutoLaunch(enabled));

/**
 * 读取缓存占用。
 */
export const getCacheInfo = async (): Promise<CacheInfo> =>
  unwrap(await window.nexus.cache.getInfo());

/**
 * 清理缓存。
 */
export const clearCache = async (target: CacheTarget): Promise<CacheInfo> =>
  unwrap(await window.nexus.cache.clear(target));

/**
 * 测试 Provider 连接并获取模型列表。
 */
export const testProvider = async (input: ProviderTestInput): Promise<ProviderProbeResult> =>
  unwrap(await window.nexus.provider.test(input));

/**
 * 读取界面语言。
 */
export const getLanguage = async (): Promise<AppLanguage> =>
  unwrap(await window.nexus.settings.getLanguage());

/**
 * 保存界面语言。
 */
export const setLanguage = async (language: AppLanguage): Promise<AppLanguage> =>
  unwrap(await window.nexus.settings.setLanguage(language));

import type { TerminalSettings, TerminalShellInfo } from '@shared/ipc/contracts';

/**
 * 读取终端外观与 shell 设置。
 */
export const getTerminalSettings = async (): Promise<TerminalSettings> =>
  unwrap(await window.nexus.terminal.getSettings());

/**
 * 保存终端外观与 shell 设置。
 */
export const getTerminalShellInfo = async (): Promise<TerminalShellInfo> =>
  unwrap(await window.nexus.terminal.getShellInfo());

export const selectTerminalShell = async (): Promise<string | undefined> =>
  unwrap(await window.nexus.terminal.selectShell()).path;

export const setTerminalSettings = async (settings: TerminalSettings): Promise<TerminalSettings> =>
  unwrap(await window.nexus.terminal.setSettings(settings));
