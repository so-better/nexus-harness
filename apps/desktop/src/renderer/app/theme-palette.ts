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
  bgPopover: string;
  bgHover: string;
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

/**
 * 浅色主题。
 */
export const lightPalette: ThemePalette = {
  bgBase: '#ffffff',
  bgElevated: '#fbfcfe',
  bgPopover: '#ffffff',
  bgHover: '#f1f6fc',
  textPrimary: '#111827',
  textSecondary: '#5b6472',
  textDisabled: '#9ca3af',
  border: '#e6ebf2',
  accent: '#3b82f6',
  accentHover: '#2563eb',
  accentPressed: '#1d4ed8',
  idle: '#6b63c9',
  success: '#15803d',
  warning: '#b45309',
  danger: '#b91c1c'
};

/**
 * 深色主题。
 */
export const darkPalette: ThemePalette = {
  bgBase: '#090d13',
  bgElevated: '#101720',
  bgPopover: '#111a24',
  bgHover: '#172233',
  textPrimary: '#f3f7ff',
  textSecondary: '#93a4bd',
  textDisabled: '#5b6a80',
  border: '#243246',
  accent: '#7fb6ff',
  accentHover: '#a9cbff',
  accentPressed: '#c9deff',
  idle: '#b6afff',
  success: '#4ade80',
  warning: '#fbbf24',
  danger: '#f87171'
};

/**
 * 按主题模式读取调色板。
 */
export const getPalette = (mode: 'light' | 'dark'): ThemePalette =>
  mode === 'dark' ? darkPalette : lightPalette;

const cssVariables: Record<keyof ThemePalette, string> = {
  bgBase: '--nh-color-bg-base',
  bgElevated: '--nh-color-bg-elevated',
  bgPopover: '--nh-color-bg-popover',
  bgHover: '--nh-color-bg-hover',
  textPrimary: '--nh-color-text-primary',
  textSecondary: '--nh-color-text-secondary',
  textDisabled: '--nh-color-text-disabled',
  border: '--nh-color-border',
  accent: '--nh-color-accent',
  accentHover: '--nh-color-accent-hover',
  accentPressed: '--nh-color-accent-pressed',
  idle: '--nh-color-idle',
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
    popoverColor: palette.bgPopover,
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
    fontWeight: '400'
  },
  Card: {
    borderRadius: '8px'
  },
  Input: {
    borderRadius: '8px',
    color: palette.bgBase,
    colorHover: palette.bgBase,
    colorFocus: palette.bgBase,
    colorDisabled: palette.bgBase
  },
  Tag: {
    borderRadius: '4px'
  }
});
