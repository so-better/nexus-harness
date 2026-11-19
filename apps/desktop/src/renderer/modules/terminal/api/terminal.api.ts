/**
 * 终端 API：封装 window.nexus.terminal 的调用。
 */

import type { TerminalEvent, TerminalSessionPublic, TerminalSettings } from '@shared/ipc/contracts';
import { unwrap } from '@/app/ipc';

export const listTerminals = async (): Promise<TerminalSessionPublic[]> =>
  unwrap(await window.nexus.terminal.list());

export const createTerminal = async (
  sessionId: string,
  cols: number,
  rows: number,
  cwd?: string
): Promise<TerminalSessionPublic> =>
  unwrap(await window.nexus.terminal.create({ sessionId, cols, rows, ...(cwd ? { cwd } : {}) }));

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

export const selectTerminalDirectory = async (): Promise<string | undefined> =>
  unwrap(await window.nexus.terminal.selectDirectory()).path;

export const selectTerminalShell = async (): Promise<string | undefined> =>
  unwrap(await window.nexus.terminal.selectShell()).path;

export const currentTerminalDirectory = async (id: string): Promise<string | null> =>
  unwrap(await window.nexus.terminal.currentDirectory(id)).cwd;

export const updateTerminalTitle = async (
  id: string,
  title: string,
  custom: boolean
): Promise<boolean> => unwrap(await window.nexus.terminal.updateTitle(id, title, custom)).ok;

export const reorderTerminals = async (ids: string[]): Promise<boolean> =>
  unwrap(await window.nexus.terminal.reorder(ids)).ok;

export const getTerminalSettings = async (): Promise<TerminalSettings> =>
  unwrap(await window.nexus.terminal.getSettings());

export const setTerminalSettings = async (settings: TerminalSettings): Promise<TerminalSettings> =>
  unwrap(await window.nexus.terminal.setSettings(settings));

export const subscribeTerminalSettings = (
  handler: (settings: TerminalSettings) => void
): (() => void) => window.nexus.terminal.onSettingsChanged(handler);

export const readTerminalClipboard = async (): Promise<string> =>
  unwrap(await window.nexus.terminal.readClipboard());

export const writeTerminalClipboard = async (text: string): Promise<boolean> =>
  unwrap(await window.nexus.terminal.writeClipboard(text)).ok;

export const openExternal = async (url: string): Promise<boolean> =>
  unwrap(await window.nexus.app.openExternal(url)).opened;

export const openPath = async (path: string): Promise<boolean> =>
  unwrap(await window.nexus.app.openPath(path)).opened;

/**
 * 提取拖入文件的本地路径；由 preload 的 webUtils 提供。
 */
export const getPathForFile = (file: File): string => window.nexus.terminal.getPathForFile(file);
