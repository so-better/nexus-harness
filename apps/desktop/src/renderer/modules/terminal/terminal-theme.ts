/**
 * 终端固定深色主题：颜色取自应用深色调色板，避免与宿主深色主题割裂。
 */

import type { GlobalThemeOverrides } from 'naive-ui';
import { darkPalette } from '@/app/theme-palette';

export const TERMINAL_FONT_FAMILY = '"SF Mono", "Cascadia Code", ui-monospace, monospace';

/** 将调色板十六进制色转换为 xterm 可识别的 rgba。 */
const withAlpha = (hex: string, alpha: number): string => {
  const value = hex.replace('#', '');
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

export const TERMINAL_COLORS = {
  background: darkPalette.bgBase,
  surface: darkPalette.bgElevated,
  hover: darkPalette.bgHover,
  border: darkPalette.border,
  text: darkPalette.textPrimary,
  secondary: darkPalette.textSecondary,
  disabled: darkPalette.textDisabled,
  accent: darkPalette.accent,
  accentHover: darkPalette.accentHover,
  selection: withAlpha(darkPalette.accent, 0.28),
  danger: darkPalette.danger,
  success: darkPalette.success,
  warning: darkPalette.warning,
  cyan: darkPalette.accentHover,
  magenta: darkPalette.idle,
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde68a',
  brightMagenta: '#d8d2ff',
  brightCyan: '#a5f0fc',
  brightWhite: '#ffffff'
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
 * Tooltip 会 teleport 到 body；显式传入主题覆盖，避免实际运行时回退到根主题。
 */
export const terminalTooltipThemeOverrides: NonNullable<GlobalThemeOverrides['Tooltip']> = {
  color: TERMINAL_COLORS.hover,
  textColor: TERMINAL_COLORS.text,
  borderRadius: '8px',
  boxShadow: `0 0 0 1px ${TERMINAL_COLORS.border}, 0 10px 28px rgb(0 0 0 / 48%)`
};

/**
 * Popconfirm 同样 teleport；显式覆盖 Popover 与按钮颜色。
 */
export const terminalPopconfirmThemeOverrides: NonNullable<GlobalThemeOverrides['Popconfirm']> = {
  peers: {
    Popover: {
      color: TERMINAL_COLORS.surface,
      textColor: TERMINAL_COLORS.text,
      dividerColor: TERMINAL_COLORS.border,
      boxShadow: '0 8px 24px rgb(0 0 0 / 32%)'
    }
  }
};

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
