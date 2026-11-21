/**
 * 终端右键菜单状态与菜单项。
 */
import type { TerminalSessionPublic } from '@shared/ipc/contracts';

export interface TerminalMenuState {
  kind: 'tab' | 'pane';
  x: number;
  y: number;
  tab?: TerminalSessionPublic;
}

export interface TerminalMenuItem {
  key: string;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
}
