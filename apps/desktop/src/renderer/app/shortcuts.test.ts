// @vitest-environment jsdom
/**
 * 快捷键匹配：CmdOrCtrl 兼容 macOS 与 Windows，修饰键必须严格一致。
 */
import { describe, expect, it } from 'vitest';
import { matchesShortcut } from './shortcuts';

const key = (value: string, init: KeyboardEventInit = {}): KeyboardEvent =>
  new KeyboardEvent('keydown', { key: value, ...init });

describe('matchesShortcut', () => {
  it('matches CmdOrCtrl on either platform', () => {
    expect(matchesShortcut(key('k', { metaKey: true }), 'CmdOrCtrl+K')).toBe(true);
    expect(matchesShortcut(key('K', { ctrlKey: true }), 'CmdOrCtrl+K')).toBe(true);
    expect(matchesShortcut(key('k', { ctrlKey: true, shiftKey: true }), 'CmdOrCtrl+K')).toBe(
      false
    );
  });

  it('supports explicit modifiers and special keys', () => {
    expect(
      matchesShortcut(key('F', { ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+F')
    ).toBe(true);
    expect(matchesShortcut(key(',', { metaKey: true }), 'CmdOrCtrl+,')).toBe(true);
    expect(matchesShortcut(key('Escape'), 'Esc')).toBe(true);
  });

  it('rejects extra modifiers', () => {
    expect(matchesShortcut(key('k', { metaKey: true, altKey: true }), 'CmdOrCtrl+K')).toBe(
      false
    );
  });
});
