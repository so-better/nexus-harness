/**
 * 设置 API：Provider、主题与应用信息，组件不直接访问 nexus。
 */

import { nexus } from '@/app/nexus-bridge';
import type { ImageSettings } from '@shared/image';
import type { SearchSettings } from '@shared/search';
import type {
  AppInfo,
  BackupExportResult,
  BackupImportResult,
  BackupStatus,
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
import type { AgentSettings, GeneralSettingsState } from '@shared/ipc/contracts';

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
export const getImageSettings = async (): Promise<ImageSettings | null> =>
  unwrap(await nexus.settings.getImage());

export const setImageSettings = async (value: ImageSettings): Promise<ImageSettings> =>
  // Vue 的响应式配置是 Proxy，直接传 IPC 会抛 "An object could not be cloned"
  unwrap(await nexus.settings.setImage(JSON.parse(JSON.stringify(value)) as ImageSettings));

export const getSearchSettings = async (): Promise<SearchSettings | null> =>
  unwrap(await nexus.settings.getSearch());

export const setSearchSettings = async (value: SearchSettings): Promise<SearchSettings> =>
  unwrap(await nexus.settings.setSearch(value));

export const openExternalLink = async (url: string): Promise<boolean> =>
  unwrap(await nexus.app.openExternal(url)).opened;

export const relaunchApp = async (): Promise<void> => {
  unwrap(await nexus.app.relaunch());
};

export const revealPath = async (path: string): Promise<boolean> =>
  unwrap(await nexus.app.showItemInFolder(path)).shown;

export const getThemeInfo = async (): Promise<ThemeInfo> => unwrap(await nexus.theme.getInfo());

/**
 * 设置主题来源。
 */
export const setThemeSource = async (source: ThemeSource): Promise<ThemeInfo> =>
  unwrap(await nexus.theme.setSource(source));

/**
 * 读取 Agent 运行设置。
 */
export const getAgentSettings = async (): Promise<AgentSettings> =>
  unwrap(await nexus.settings.getAgent());

/**
 * 保存 Agent 运行设置。
 */
export const setAgentSettings = async (value: AgentSettings): Promise<AgentSettings> =>
  unwrap(await nexus.settings.setAgent(value));

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

/**
 * 导出完整数据备份；返回备份目录路径。
 */
export const exportBackup = async (): Promise<BackupExportResult | null> =>
  unwrap(await nexus.settings.exportBackup());

/**
 * 导入数据备份；恢复在下次启动时生效。
 */
export const importBackup = async (): Promise<BackupImportResult | null> =>
  unwrap(await nexus.settings.importBackup());

export const getBackupStatus = async (): Promise<BackupStatus> =>
  unwrap(await nexus.settings.backupStatus());

export const onGeneralSettingsChanged = (
  handler: (state: GeneralSettingsState) => void
): (() => void) => nexus.settings.onGeneralChanged(handler);

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

/**
 * 读取 AI 命令将使用的 shell 信息（未配置时为平台默认）。
 */
export const getTerminalAiShellInfo = async (): Promise<TerminalShellInfo> =>
  unwrap(await nexus.terminal.getAiShellInfo());

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
