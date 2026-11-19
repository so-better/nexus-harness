/**
 * 渲染进程主题初始化：同步主题、CSS 变量与 Naive UI 调色板。
 */

import { nexus } from './nexus-bridge';
import { ref } from 'vue';
import type { ThemeInfo, ThemeSource } from '@shared/ipc/contracts';
import { applyPalette, getPalette } from './theme-palette';

/**
 * 当前实际生效主题；Naive UI 配置订阅此状态。
 */
export const effectiveTheme = ref<'light' | 'dark'>(
  document.documentElement.dataset['theme'] === 'dark' ? 'dark' : 'light'
);

export const themeSource = ref<ThemeSource>('system');

applyPalette(getPalette(effectiveTheme.value));

/**
 * 把主题信息应用到根节点与 CSS 变量。
 */
const applyTheme = (info: ThemeInfo): void => {
  const root = document.documentElement;
  root.dataset['theme'] = info.effective;
  root.style.colorScheme = info.effective;
  effectiveTheme.value = info.effective;
  themeSource.value = info.source;
  applyPalette(getPalette(info.effective));
};

/**
 * 读取初始主题并订阅系统/用户切换；返回取消订阅函数。
 */
export const initTheme = async (): Promise<() => void> => {
  try {
    const theme = nexus?.theme;
    if (!theme) return () => undefined;

    const unsubscribe = theme.onChange(applyTheme);
    const result = await theme.getInfo();
    if (result.ok) applyTheme(result.data);

    return unsubscribe;
  } catch {
    // preload 或主题读取失败时保持默认主题，不阻塞应用启动
    return () => undefined;
  }
};
