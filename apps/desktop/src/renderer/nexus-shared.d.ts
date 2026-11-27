/**
 * 插件可选复用的宿主共享模块类型。
 * 配合桌面端导入映射 `nexus/vue`、`nexus/naive-ui`、`nexus/theme`、`nexus/echarts`：
 * 运行时由宿主 window.__nexusShared 提供，插件里 `import { ... } from 'nexus/...'` 即复用宿主同一份。
 * 插件作者可复制本文件获得类型提示。
 */

declare module 'nexus/vue' {
  export * from 'vue';
}

declare module 'nexus/naive-ui' {
  export * from 'naive-ui';
}

declare module 'nexus/theme' {
  export interface ThemePalette {
    bgBase: string;
    bgElevated: string;
    bgModal: string;
    bgPopover: string;
    bgHover: string;
    codeBg: string;
    codeText: string;
    textPrimary: string;
    textSecondary: string;
    textDisabled: string;
    border: string;
    accent: string;
    accentHover: string;
    accentPressed: string;
    idle: string;
    success: string;
    warning: string;
    danger: string;
  }
  export const lightPalette: ThemePalette;
  export const darkPalette: ThemePalette;
  export function getPalette(mode: 'light' | 'dark'): ThemePalette;
  export function applyPalette(palette: ThemePalette): void;
}

declare module 'nexus/echarts' {
  export function loadEcharts(): Promise<typeof import('echarts')>;
}
