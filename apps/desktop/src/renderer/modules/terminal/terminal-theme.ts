/**
 * 终端固定深色主题：颜色取自应用深色调色板，避免与宿主深色主题割裂。
 */

import type { GlobalThemeOverrides } from 'naive-ui';

export const TERMINAL_FONT_FAMILY = '"SF Mono", "Cascadia Code", ui-monospace, monospace';

export const TERMINAL_COLORS = {
  background: '#090d13',
  surface: '#101720',
  hover: '#172233',
  border: '#243246',
  text: '#f3f7ff',
  secondary: '#93a4bd',
  disabled: '#5b6a80',
  accent: '#7fb6ff',
  accentHover: '#a9cbff',
  selection: 'rgba(127, 182, 255, 0.28)',
  danger: '#f87171',
  success: '#4ade80',
  warning: '#fbbf24',
  cyan: '#67e3f9',
  magenta: '#b6afff'
} as const;

/**
 * 终端面板的 CSS 变量，供固定深色样式复用。
 */
export const terminalCssVariables = {
  '--terminal-bg': TERMINAL_COLORS.background,
  '--terminal-surface': TERMINAL_COLORS.surface,
  '--terminal-hover': TERMINAL_COLORS.hover,
  '--terminal-border': TERMINAL_COLORS.border,
  '--terminal-text': TERMINAL_COLORS.text,
  '--terminal-secondary': TERMINAL_COLORS.secondary,
  '--terminal-disabled': TERMINAL_COLORS.disabled,
  '--terminal-accent': TERMINAL_COLORS.accent,
  '--terminal-danger': TERMINAL_COLORS.danger
} as const;

/**
 * Naive UI 在终端视图内的深色覆盖；避免按钮、输入框、tooltip 和 popconfirm 回到浅色。
 */
export const terminalThemeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: TERMINAL_COLORS.accent,
    primaryColorHover: TERMINAL_COLORS.accentHover,
    primaryColorPressed: TERMINAL_COLORS.accent,
    primaryColorSuppl: TERMINAL_COLORS.accentHover,
    bodyColor: TERMINAL_COLORS.background,
    cardColor: TERMINAL_COLORS.surface,
    popoverColor: TERMINAL_COLORS.surface,
    modalColor: TERMINAL_COLORS.surface,
    inputColor: TERMINAL_COLORS.background,
    actionColor: TERMINAL_COLORS.surface,
    hoverColor: TERMINAL_COLORS.hover,
    borderColor: TERMINAL_COLORS.border,
    dividerColor: TERMINAL_COLORS.border,
    textColorBase: TERMINAL_COLORS.text,
    textColor1: TERMINAL_COLORS.text,
    textColor2: TERMINAL_COLORS.text,
    textColor3: TERMINAL_COLORS.secondary,
    textColorDisabled: TERMINAL_COLORS.disabled,
    successColor: TERMINAL_COLORS.success,
    warningColor: TERMINAL_COLORS.warning,
    errorColor: TERMINAL_COLORS.danger,
    infoColor: TERMINAL_COLORS.accent,
    borderRadius: '8px',
    borderRadiusSmall: '4px'
  },
  Button: {
    borderRadiusMedium: '8px',
    borderRadiusSmall: '4px'
  },
  Input: {
    color: TERMINAL_COLORS.background,
    colorHover: TERMINAL_COLORS.background,
    colorFocus: TERMINAL_COLORS.background,
    colorDisabled: TERMINAL_COLORS.surface
  }
};
