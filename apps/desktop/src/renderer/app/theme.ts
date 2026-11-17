/* 渲染进程主题初始化：同步主进程主题到 html 的 data-theme 与 color-scheme。 */

import type { ThemeInfo } from '@shared/ipc/contracts';

/* 将主题信息应用到根节点，原生滚动条与表单控件跟随 color-scheme。 */
const applyTheme = (info: ThemeInfo): void => {
  const root = document.documentElement;
  root.dataset['theme'] = info.effective;
  root.style.colorScheme = info.effective;
};

/* 读取初始主题并订阅系统/用户切换；返回取消订阅函数。 */
export const initTheme = async (): Promise<() => void> => {
  const unsubscribe = window.nexus.theme.onChange(applyTheme);

  try {
    const result = await window.nexus.theme.getInfo();
    if (result.ok) applyTheme(result.data);
  } catch {
    // 主题读取失败时保持浏览器默认主题，不阻塞应用启动
  }

  return unsubscribe;
};
