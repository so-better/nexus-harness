/**
 * 插件 API：渲染层不直接访问 nexus。
 */

import { nexus } from '@/app/nexus-bridge';
import type { NexusEvent } from '@shared/events';
import type {
  PluginPublic,
  PluginSettingValue,
  PluginSkinChangedPayload,
  PluginSkinSelection,
  PluginStartupChangedPayload,
  PluginStartupSelection,
  PluginWorkspaceEntry
} from '@shared/plugin';
import type { UsageStats, UsageStatsInput } from '@shared/usage';
import { unwrap } from '@/app/ipc';

export const listPlugins = async (): Promise<PluginPublic[]> => unwrap(await nexus.plugin.list());

export const setPluginEnabled = async (id: string, enabled: boolean): Promise<PluginPublic[]> =>
  unwrap(await nexus.plugin.setEnabled(id, enabled));

export const importPluginDirectory = async (): Promise<PluginPublic[] | null> =>
  unwrap(await nexus.plugin.importFromDirectory());

export const reloadPlugins = async (): Promise<PluginPublic[]> =>
  unwrap(await nexus.plugin.reload());

export const uninstallPlugin = async (id: string): Promise<PluginPublic[]> =>
  unwrap(await nexus.plugin.uninstall(id));

export const subscribePluginChanges = (handler: (plugins: PluginPublic[]) => void): (() => void) =>
  nexus.plugin.onChanged(handler);

export const getPluginStorage = async (pluginId: string, key: string): Promise<unknown> =>
  unwrap(await nexus.plugin.storageGet(pluginId, key));

export const setPluginStorage = async (
  pluginId: string,
  key: string,
  value: unknown
): Promise<void> => {
  unwrap(await nexus.plugin.storageSet(pluginId, key, value));
};

export const deletePluginStorage = async (pluginId: string, key: string): Promise<void> => {
  unwrap(await nexus.plugin.storageDelete(pluginId, key));
};

export const getPluginSettings = async (
  pluginId: string
): Promise<Record<string, PluginSettingValue>> => unwrap(await nexus.plugin.settingsGet(pluginId));

export const setPluginSettings = async (
  pluginId: string,
  values: Record<string, PluginSettingValue>
): Promise<Record<string, PluginSettingValue>> =>
  unwrap(await nexus.plugin.settingsSet(pluginId, values));

export const logPlugin = async (
  pluginId: string,
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string
): Promise<void> => {
  unwrap(await nexus.plugin.log(pluginId, level, message));
};

export const notifyPlugin = async (
  pluginId: string,
  message: string,
  level: 'info' | 'warning' | 'error' = 'info'
): Promise<void> => {
  unwrap(await nexus.plugin.notify(pluginId, message, level));
};

export const reportPluginError = async (pluginId: string, error: string): Promise<void> => {
  unwrap(await nexus.plugin.reportError(pluginId, error));
};

export const subscribePluginEvents = (handler: (event: NexusEvent) => void): (() => void) =>
  nexus.agent.onEvent(handler);

export const readPluginWorkspace = async (
  pluginId: string,
  sessionId: string,
  path: string
): Promise<string> => unwrap(await nexus.plugin.workspaceRead(pluginId, sessionId, path));

export const listPluginWorkspace = async (
  pluginId: string,
  sessionId: string,
  path?: string
): Promise<PluginWorkspaceEntry[]> =>
  unwrap(await nexus.plugin.workspaceList(pluginId, sessionId, path));

export const getUsageStats = async (input?: UsageStatsInput): Promise<UsageStats> =>
  unwrap(await nexus.usage.stats(input));

export const getSelectedSkin = async (): Promise<PluginSkinSelection | null> =>
  unwrap(await nexus.settings.getSkin());

export const setSelectedSkin = async (
  selection: PluginSkinSelection | null
): Promise<PluginSkinSelection | null> => unwrap(await nexus.settings.setSkin(selection));

export const subscribeSkinChanges = (
  handler: (payload: PluginSkinChangedPayload) => void
): (() => void) => nexus.settings.onSkinChanged(handler);

export const getSelectedStartup = async (): Promise<PluginStartupSelection | null> =>
  unwrap(await nexus.settings.getStartup());

export const setSelectedStartup = async (
  selection: PluginStartupSelection | null
): Promise<PluginStartupSelection | null> => unwrap(await nexus.settings.setStartup(selection));

export const subscribeStartupChanges = (
  handler: (payload: PluginStartupChangedPayload) => void
): (() => void) => nexus.settings.onStartupChanged(handler);
