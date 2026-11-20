/**
 * 快捷键匹配：支持 CmdOrCtrl / Cmd / Ctrl / Shift / Alt 与常见按键。
 * 插件仍使用字符串声明快捷键，这里只做统一解释，不注册系统级全局热键。
 */

const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  space: ' ',
  return: 'enter',
  comma: ','
};

interface ParsedShortcut {
  key: string;
  meta: boolean;
  ctrl: boolean;
  cmdOrCtrl: boolean;
  shift: boolean;
  alt: boolean;
}

/**
 * 把快捷键字符串拆成键盘事件需要的修饰键与主键。
 */
const parseShortcut = (shortcut: string): ParsedShortcut | undefined => {
  const tokens = shortcut
    .split('+')
    .map((token) => token.trim())
    .filter(Boolean);
  const rawKey = tokens.pop();
  if (!rawKey) return undefined;

  const modifiers = new Set(tokens.map((token) => token.toLowerCase()));
  return {
    key: (KEY_ALIASES[rawKey.toLowerCase()] ?? rawKey).toLowerCase(),
    meta: modifiers.has('cmd') || modifiers.has('command'),
    ctrl: modifiers.has('ctrl') || modifiers.has('control'),
    cmdOrCtrl: modifiers.has('cmdorctrl') || modifiers.has('mod'),
    shift: modifiers.has('shift'),
    alt: modifiers.has('alt') || modifiers.has('option')
  };
};

/**
 * 判断键盘事件是否与声明快捷键一致；未声明的修饰键必须处于释放状态。
 */
export const matchesShortcut = (event: KeyboardEvent, shortcut: string): boolean => {
  const parsed = parseShortcut(shortcut);
  if (!parsed) return false;
  const key = KEY_ALIASES[event.key.toLowerCase()] ?? event.key.toLowerCase();
  if (key !== parsed.key) return false;
  if (event.shiftKey !== parsed.shift) return false;
  if (event.altKey !== parsed.alt) return false;
  if (parsed.cmdOrCtrl) {
    if (!event.metaKey && !event.ctrlKey) return false;
    return true;
  }
  return event.metaKey === parsed.meta && event.ctrlKey === parsed.ctrl;
};
