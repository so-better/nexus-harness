/**
 * 终端面板宽度约束测试。
 */

import { describe, expect, it } from 'vitest';
import { clampTerminalWidth, maxTerminalWidth, TERMINAL_DEFAULT_WIDTH } from './terminal-layout';

describe('terminal layout', () => {
  it('keeps the default width and caps it at 720px', () => {
    expect(clampTerminalWidth(TERMINAL_DEFAULT_WIDTH, 2000)).toBe(600);
    expect(maxTerminalWidth(2000)).toBe(720);
    expect(clampTerminalWidth(1000, 2000)).toBe(720);
  });

  it('reserves space for the chat area on smaller windows', () => {
    expect(maxTerminalWidth(1440)).toBe(672);
    expect(maxTerminalWidth(1200)).toBe(432);
    expect(clampTerminalWidth(600, 1024)).toBe(280);
    expect(maxTerminalWidth(800)).toBe(280);
  });
});
