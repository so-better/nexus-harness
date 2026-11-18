/**
 * 应用壳状态：版本信息、设置弹窗与主题切换。
 */

import { ref } from 'vue';
import { themeSource } from '@/app/theme';
import { getAppInfo, setThemeSource } from '@/modules/settings/api/settings.api';

/**
 * 管理设置入口与底部版本信息。
 */
export const useAppMeta = () => {
  const version = ref('0.0.0');
  const settingsOpen = ref(false);

  /**
   * 读取应用版本；失败时保留占位值。
   */
  const load = async (): Promise<void> => {
    try {
      version.value = (await getAppInfo()).version;
    } catch {
      // 版本读取失败不影响工作台使用
    }
  };

  /**
   * 在浅色与深色之间快速切换。
   */
  const setTheme = async (source: 'system' | 'light' | 'dark'): Promise<void> => {
    try {
      await setThemeSource(source);
    } catch {
      // 主题切换失败时保持当前主题
    }
  };

  return { version, settingsOpen, themeSource, load, setTheme };
};
