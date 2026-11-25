/**
 * 终端面板尺寸约束：默认固定宽度，拖动时保证对话区仍有可用空间。
 */

export const TERMINAL_DEFAULT_WIDTH = 600;
export const TERMINAL_MIN_WIDTH = 280;
export const TERMINAL_MAX_WIDTH = 720;
export const TERMINAL_MIN_CHAT_WIDTH = 480;
export const TERMINAL_SIDEBAR_WIDTH = 288;

/**
 * 当前窗口允许的最大终端宽度。
 */
export const maxTerminalWidth = (viewportWidth: number): number =>
  Math.max(
    TERMINAL_MIN_WIDTH,
    Math.min(
      TERMINAL_MAX_WIDTH,
      Math.floor(viewportWidth - TERMINAL_SIDEBAR_WIDTH - TERMINAL_MIN_CHAT_WIDTH)
    )
  );

/**
 * 把终端宽度限制在固定最小值、最大值与对话区保留宽度之间。
 */
export const clampTerminalWidth = (width: number, viewportWidth: number): number =>
  Math.min(Math.max(Math.floor(width), TERMINAL_MIN_WIDTH), maxTerminalWidth(viewportWidth));
