/**
 * 向插件暴露宿主共享模块。
 * - vue / theme：宿主已加载，直接复用（同步 shim）；theme 只暴露安全的调色板子集，不含 getNaiveOverrides（其值含 var() 会崩）。
 * - naive-ui / echarts：体积大，提供**懒加载器**，shim 用顶层 await 按需拉取，避免进入启动主 chunk。
 * 由 public/nexus-*.mjs 按需 re-export；插件通过导入映射 `nexus/vue`、`nexus/naive-ui`、
 * `nexus/theme`、`nexus/echarts` 引用。
 */

import * as vue from 'vue';
import { applyPalette, darkPalette, getPalette, lightPalette } from '@/app/theme-palette';

/** 只暴露安全子集，避免插件直接拿到含 CSS 变量的 getNaiveOverrides */
const theme = { getPalette, applyPalette, lightPalette, darkPalette };

declare global {
  interface Window {
    __nexusShared?: {
      vue: typeof vue;
      theme: typeof theme;
      naiveUi: { load: () => Promise<unknown> };
      echarts: { load: () => Promise<unknown> };
    };
  }
}

window.__nexusShared = {
  vue,
  theme,
  naiveUi: { load: () => import('naive-ui') },
  echarts: { load: () => import('echarts') }
};
