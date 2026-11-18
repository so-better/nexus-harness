/**
 * 主题调色板：CSS 变量与 Naive UI 覆盖共用的唯一颜色来源。
 */

import type { GlobalThemeOverrides } from 'naive-ui';

/**
 * 应用语义颜色，供 CSS 与 Naive UI 共同使用。
 */
export interface ThemePalette {
  bgBase: string;
  bgElevated: string;
  bgHover: string;
  textPrimary: string;
  textSecondary: string;
  textDisabled: string;
  border: string;
  accent: string;
  accentHover: string;
  accentPressed: string;
  success: string;
  warning: string;
  danger: string;
}

/**
 * 浅色主题。
 */
export const lightPalette: ThemePalette = {
  bgBase: '#fcfbf9',
  bgElevated: '#f4f2ed',
  bgHover: '#ece9e2',
  textPrimary: '#1c1b19',
  textSecondary: '#6b675f',
  textDisabled: '#a8a39a',
  border: '#e3dfd7',
  accent: '#2f5bff',
  accentHover: '#244ce0',
  accentPressed: '#1c3fbf',
  success: '#1e7a52',
  warning: '#b66a1c',
  danger: '#b23a3a'
};

/**
 * 深色主题。
 */
export const darkPalette: ThemePalette = {
  bgBase: '#101112',
  bgElevated: '#17181b',
  bgHover: '#222428',
  textPrimary: '#f1eee8',
  textSecondary: '#a7a29a',
  textDisabled: '#6d6962',
  border: '#2a2b2e',
  accent: '#6c8cff',
  accentHover: '#8aa3ff',
  accentPressed: '#a6b7ff',
  success: '#4dbe8b',
  warning: '#e0a34e',
  danger: '#e06a6a'
};

/**
 * 按主题模式读取调色板。
 */
export const getPalette = (mode: 'light' | 'dark'): ThemePalette =>
  mode === 'dark' ? darkPalette : lightPalette;

const cssVariables: Record<keyof ThemePalette, string> = {
  bgBase: '--nh-color-bg-base',
  bgElevated: '--nh-color-bg-elevated',
  bgHover: '--nh-color-bg-hover',
  textPrimary: '--nh-color-text-primary',
  textSecondary: '--nh-color-text-secondary',
  textDisabled: '--nh-color-text-disabled',
  border: '--nh-color-border',
  accent: '--nh-color-accent',
  accentHover: '--nh-color-accent-hover',
  accentPressed: '--nh-color-accent-pressed',
  success: '--nh-color-success',
  warning: '--nh-color-warning',
  danger: '--nh-color-danger'
};

/**
 * 把调色板写入根节点 CSS 变量。
 */
export const applyPalette = (palette: ThemePalette): void => {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(palette)) {
    const cssVariable = cssVariables[key as keyof ThemePalette];
    root.style.setProperty(cssVariable, value);
  }
};

/**
 * 由同一调色板派生 Naive UI 覆盖，避免出现第二套色板。
 */
export const getNaiveOverrides = (palette: ThemePalette): GlobalThemeOverrides => ({
  common: {
    primaryColor: palette.accent,
    primaryColorHover: palette.accentHover,
    primaryColorPressed: palette.accentPressed,
    primaryColorSuppl: palette.accentHover,
    bodyColor: palette.bgBase,
    cardColor: palette.bgElevated,
    modalColor: palette.bgElevated,
    popoverColor: palette.bgElevated,
    inputColor: palette.bgBase,
    actionColor: palette.bgElevated,
    hoverColor: palette.bgHover,
    borderColor: palette.border,
    dividerColor: palette.border,
    textColorBase: palette.textPrimary,
    textColor1: palette.textPrimary,
    textColor2: palette.textPrimary,
    textColor3: palette.textSecondary,
    textColorDisabled: palette.textDisabled,
    successColor: palette.success,
    warningColor: palette.warning,
    errorColor: palette.danger,
    infoColor: palette.accent,
    borderRadius: '8px',
    borderRadiusSmall: '4px',
    fontFamily: '-apple-system, "SF Pro Text", "Segoe UI Variable", "Segoe UI", sans-serif',
    fontSize: '14px',
    fontWeightStrong: '600',
    lineHeight: '1.6'
  },
  Button: {
    borderRadiusMedium: '8px',
    borderRadiusSmall: '4px',
    fontWeight: '500'
  },
  Card: {
    borderRadius: '8px'
  },
  Input: {
    borderRadius: '8px'
  },
  Tag: {
    borderRadius: '4px'
  }
});
