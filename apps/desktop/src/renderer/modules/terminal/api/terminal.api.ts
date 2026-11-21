/**
 * 终端 API：封装 nexus.terminal 的调用。
 */

import { nexus } from '@/app/nexus-bridge';
import type { TerminalEvent, TerminalSessionPublic, TerminalSettings } from '@shared/ipc/contracts';
import { unwrap } from '@/app/ipc';

export const listTerminals = async (): Promise<TerminalSessionPublic[]> =>
  unwrap(await nexus.terminal.list());

export const createTerminal = async (
  sessionId: string,
  cols: number,
  rows: number,
  cwd?: string
): Promise<TerminalSessionPublic> =>
  unwrap(await nexus.terminal.create({ sessionId, cols, rows, ...(cwd ? { cwd } : {}) }));

export const writeTerminal = async (id: string, data: string): Promise<boolean> => {
  const result = await nexus.terminal.write({ id, data });
  return result.ok ? result.data.ok : false;
};

export const resizeTerminal = async (id: string, cols: number, rows: number): Promise<boolean> => {
  const result = await nexus.terminal.resize({ id, cols, rows });
  return result.ok ? result.data.ok : false;
};

export const busyTerminals = async (ids: string[]): Promise<string[]> =>
  unwrap(await nexus.terminal.busy({ ids })).busy;

export const setTerminalAiAccess = async (
  id: string,
  allowed: boolean
): Promise<boolean> => unwrap(await nexus.terminal.setAiAccess({ id, allowed })).ok;

export const closeTerminal = async (id: string): Promise<boolean> => {
  const result = await nexus.terminal.close({ id });
  return result.ok ? result.data.closed : false;
};

export const subscribeTerminalEvents = (handler: (event: TerminalEvent) => void): (() => void) =>
  nexus.terminal.onEvent(handler);

export const selectTerminalDirectory = async (): Promise<string | undefined> =>
  unwrap(await nexus.terminal.selectDirectory()).path;

export const selectTerminalShell = async (): Promise<string | undefined> =>
  unwrap(await nexus.terminal.selectShell()).path;

export const currentTerminalDirectory = async (id: string): Promise<string | null> =>
  unwrap(await nexus.terminal.currentDirectory(id)).cwd;

export const updateTerminalTitle = async (
  id: string,
  title: string,
  custom: boolean
): Promise<boolean> => unwrap(await nexus.terminal.updateTitle(id, title, custom)).ok;

export const reorderTerminals = async (ids: string[]): Promise<boolean> =>
  unwrap(await nexus.terminal.reorder(ids)).ok;

export const getTerminalSettings = async (): Promise<TerminalSettings> =>
  unwrap(await nexus.terminal.getSettings());

export const setTerminalSettings = async (settings: TerminalSettings): Promise<TerminalSettings> =>
  unwrap(await nexus.terminal.setSettings(settings));

export const subscribeTerminalSettings = (
  handler: (settings: TerminalSettings) => void
): (() => void) => nexus.terminal.onSettingsChanged(handler);

export const readTerminalClipboard = async (): Promise<string> =>
  unwrap(await nexus.terminal.readClipboard());

export const writeTerminalClipboard = async (text: string): Promise<boolean> =>
  unwrap(await nexus.terminal.writeClipboard(text)).ok;

export const openExternal = async (url: string): Promise<boolean> =>
  unwrap(await nexus.app.openExternal(url)).opened;

export const openPath = async (path: string): Promise<boolean> =>
  unwrap(await nexus.app.openPath(path)).opened;

/**
 * 提取拖入文件的本地路径；由 preload 的 webUtils 提供。
 */
export const getPathForFile = (file: File): string => nexus.terminal.getPathForFile(file);
