/**
 * 设置 API：Provider、主题与应用信息，组件不直接访问 window.nexus。
 */

import type {
  AppInfo,
  ProviderPublic,
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
