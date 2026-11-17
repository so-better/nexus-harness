/* 主题基础：主进程统一读取系统主题并同步窗口背景。 */

import { nativeTheme, type BrowserWindow } from 'electron';
import type { ThemeInfo, ThemeSource } from '@shared/ipc/contracts';

/* 当前实际生效的浅色/深色主题。 */
export const getEffectiveTheme = (): 'light' | 'dark' =>
  nativeTheme.shouldUseDarkColors ? 'dark' : 'light';

/* 返回给渲染进程的主题状态。 */
export const getThemeInfo = (): ThemeInfo => ({
  source: nativeTheme.themeSource as ThemeSource,
  effective: getEffectiveTheme()
});

/* 窗口背景色与渲染层 --nh-color-bg-base 保持一致，避免启动闪白。 */
export const getWindowBackgroundColor = (): string =>
  getEffectiveTheme() === 'dark' ? '#0b0f14' : '#ffffff';

/* 将当前主题背景应用到窗口。 */
export const applyWindowBackground = (window: BrowserWindow): void => {
  window.setBackgroundColor(getWindowBackgroundColor());
};
