/**
 * 终端 API：封装 window.nexus.terminal 的调用。
 */

import type { TerminalEvent, TerminalSessionPublic } from '@shared/ipc/contracts';
import { unwrap } from '@/app/ipc';

export const listTerminals = async (): Promise<TerminalSessionPublic[]> =>
  unwrap(await window.nexus.terminal.list());

export const createTerminal = async (
  sessionId: string,
  cols: number,
  rows: number
): Promise<TerminalSessionPublic> =>
  unwrap(await window.nexus.terminal.create({ sessionId, cols, rows }));

export const writeTerminal = async (id: string, data: string): Promise<boolean> => {
  const result = await window.nexus.terminal.write({ id, data });
  return result.ok ? result.data.ok : false;
};

export const resizeTerminal = async (id: string, cols: number, rows: number): Promise<boolean> => {
  const result = await window.nexus.terminal.resize({ id, cols, rows });
  return result.ok ? result.data.ok : false;
};

export const busyTerminals = async (ids: string[]): Promise<string[]> =>
  unwrap(await window.nexus.terminal.busy({ ids })).busy;

export const closeTerminal = async (id: string): Promise<boolean> => {
  const result = await window.nexus.terminal.close({ id });
  return result.ok ? result.data.closed : false;
};

export const subscribeTerminalEvents = (handler: (event: TerminalEvent) => void): (() => void) =>
  window.nexus.terminal.onEvent(handler);
