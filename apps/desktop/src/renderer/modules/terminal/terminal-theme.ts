/**
 * 终端固定深色主题：颜色取自应用深色调色板，避免与宿主深色主题割裂。
 */

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
