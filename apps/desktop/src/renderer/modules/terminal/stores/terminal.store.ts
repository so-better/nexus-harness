/**
 * 终端面板状态：标签、尺寸、输出缓冲与 PTY 事件订阅。
 */

import { computed, reactive, ref } from 'vue';
import { defineStore } from 'pinia';
import { DEFAULT_TERMINAL_SETTINGS } from '@shared/ipc/contracts';
import type { TerminalEvent, TerminalSessionPublic, TerminalSettings } from '@shared/ipc/contracts';
import { TERMINAL_DEFAULT_WIDTH, clampTerminalWidth } from '../terminal-layout';
import {
  busyTerminals,
  closeTerminal,
  createTerminal,
  currentTerminalDirectory,
  getTerminalSettings,
  listTerminals,
  reorderTerminals,
  resizeTerminal,
  selectTerminalDirectory,
  subscribeTerminalEvents,
  subscribeTerminalSettings,
  updateTerminalTitle,
  writeTerminal
} from '../api/terminal.api';

const MAX_BUFFER = 500_000;

export interface TerminalController {
  findNext: (term: string) => boolean;
  findPrevious: (term: string) => boolean;
  clearSearch: () => void;
  copy: () => Promise<boolean>;
  paste: () => Promise<void>;
  selectAll: () => void;
  clear: () => void;
  focus: () => void;
}

export const useTerminalStore = defineStore('terminal', () => {
  const tabs = ref<TerminalSessionPublic[]>([]);
  const activeId = ref<string>();
  const open = ref(false);
  const mounted = ref(false);
  const ready = ref(false);
  const width = ref(clampTerminalWidth(TERMINAL_DEFAULT_WIDTH, window.innerWidth));
  const error = ref<string>();
  const settings = ref<TerminalSettings>({ ...DEFAULT_TERMINAL_SETTINGS });
  const outputs = reactive<Record<string, string>>({});
  let unsubscribe: (() => void) | undefined;
  let unsubscribeSettings: (() => void) | undefined;
  const titleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const controllers = new Map<string, TerminalController>();

  const activeTab = computed(() => tabs.value.find((tab) => tab.id === activeId.value));

  const upsert = (terminal: TerminalSessionPublic): void => {
    const index = tabs.value.findIndex((tab) => tab.id === terminal.id);
    if (index >= 0) tabs.value[index] = terminal;
    else tabs.value = [...tabs.value, terminal];
    if (!activeId.value) activeId.value = terminal.id;
  };

  const removeTab = (id: string): void => {
    tabs.value = tabs.value.filter((tab) => tab.id !== id);
    delete outputs[id];
    controllers.delete(id);
    if (activeId.value === id) activeId.value = tabs.value.at(-1)?.id;
  };

  const pushData = (id: string, data: string): void => {
    const next = `${outputs[id] ?? ''}${data}`;
    outputs[id] = next.length > MAX_BUFFER ? next.slice(-MAX_BUFFER) : next;
    scheduleTitleSync(id);
  };

  const handleEvent = (event: TerminalEvent): void => {
    if (event.type === 'created') {
      const isNew = !tabs.value.some((tab) => tab.id === event.terminal.id);
      upsert(event.terminal);
      if (isNew) {
        open.value = true;
        mounted.value = true;
        activeId.value = event.terminal.id;
      }
      return;
    }
    if (event.type === 'data') {
      pushData(event.id, event.data);
      return;
    }
    if (event.type === 'exit') {
      const tab = tabs.value.find((item) => item.id === event.id);
      if (tab) {
        tab.status = 'exited';
        tab.exitCode = event.exitCode;
      }
      return;
    }
    removeTab(event.id);
  };

  /**
   * 窗口变窄时收紧终端，避免中间对话区被挤没。
   */
  const handleResize = (): void => {
    width.value = clampTerminalWidth(width.value, window.innerWidth);
  };

  /**
   * 启动一次全局订阅；主进程终端可能由 AI 直接创建。
   */
  const init = (): void => {
    if (!unsubscribe) unsubscribe = subscribeTerminalEvents(handleEvent);
    if (!unsubscribeSettings) {
      unsubscribeSettings = subscribeTerminalSettings((next) => {
        settings.value = next;
      });
    }
    window.addEventListener('resize', handleResize);
    getTerminalSettings()
      .then((next) => {
        settings.value = next;
      })
      .catch(() => undefined);
    listTerminals()
      .then((terminals) => {
        for (const terminal of terminals) upsert(terminal);
      })
      .catch((reason: unknown) => {
        error.value = reason instanceof Error ? reason.message : String(reason);
      })
      .finally(() => {
        ready.value = true;
      });
  };

  /**
   * 打开面板并设置默认宽度为窗口的一半。
   */
  const openPanel = (): void => {
    open.value = true;
    mounted.value = true;
  };

  const togglePanel = (): void => {
    if (open.value) open.value = false;
    else openPanel();
  };

  const setWidth = (next: number): void => {
    width.value = clampTerminalWidth(next, window.innerWidth);
  };

  const create = async (sessionId: string, cwd?: string): Promise<boolean> => {
    try {
      error.value = undefined;
      await createTerminal(sessionId, 100, 30, cwd);
      openPanel();
      return true;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
      return false;
    }
  };

  const currentDirectory = async (id: string): Promise<string | null> => {
    try {
      return await currentTerminalDirectory(id);
    } catch {
      return null;
    }
  };

  const selectDirectory = async (): Promise<string | undefined> => {
    try {
      return await selectTerminalDirectory();
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
      return undefined;
    }
  };

  const scheduleTitleSync = (id: string): void => {
    const existing = titleTimers.get(id);
    if (existing !== undefined) clearTimeout(existing);
    titleTimers.set(
      id,
      setTimeout(() => {
        titleTimers.delete(id);
        syncTitle(id).catch(() => undefined);
      }, 350)
    );
  };

  const syncTitle = async (id: string): Promise<void> => {
    const tab = tabs.value.find((item) => item.id === id);
    if (!tab || tab.customTitle) return;
    const cwd = await currentTerminalDirectory(id);
    if (!cwd) return;
    const current = tabs.value.find((item) => item.id === id);
    if (!current || current.customTitle) return;
    const title = cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? '终端';
    if (current.title !== title) {
      current.title = title;
      updateTerminalTitle(id, title, false).catch(() => undefined);
    }
  };

  const write = async (id: string, data: string): Promise<void> => {
    await writeTerminal(id, data).catch(() => false);
  };

  const resize = async (id: string, cols: number, rows: number): Promise<void> => {
    await resizeTerminal(id, cols, rows).catch(() => false);
  };

  const busy = async (ids: string[]): Promise<string[]> => {
    try {
      return await busyTerminals(ids);
    } catch {
      return ids;
    }
  };

  const close = async (id: string): Promise<void> => {
    await closeTerminal(id).catch(() => false);
    removeTab(id);
    if (!tabs.value.length) open.value = false;
  };

  const rename = (id: string, title: string): void => {
    const tab = tabs.value.find((item) => item.id === id);
    if (tab && title.trim()) {
      tab.title = title.trim();
      tab.customTitle = true;
      updateTerminalTitle(id, tab.title, true).catch(() => undefined);
    }
  };

  const resetTitle = (id: string): void => {
    const tab = tabs.value.find((item) => item.id === id);
    if (!tab) return;
    tab.customTitle = false;
    updateTerminalTitle(id, tab.title, false).catch(() => undefined);
    syncTitle(id).catch(() => undefined);
  };

  const moveTab = (from: number, to: number): void => {
    if (from === to || from < 0 || to < 0) return;
    const next = [...tabs.value];
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(to, 0, item);
    tabs.value = next;
  };

  const setTabOrder = async (next: TerminalSessionPublic[]): Promise<boolean> => {
    tabs.value = [...next];
    try {
      await reorderTerminals(next.map((tab) => tab.id));
      return true;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
      return false;
    }
  };

  const registerController = (id: string, controller: TerminalController): (() => void) => {
    controllers.set(id, controller);
    return () => controllers.delete(id);
  };

  const controller = (id: string | undefined): TerminalController | undefined =>
    id ? controllers.get(id) : undefined;

  const buffer = (id: string): string => outputs[id] ?? '';

  return {
    tabs,
    activeId,
    activeTab,
    open,
    mounted,
    ready,
    width,
    error,
    settings,
    init,
    openPanel,
    togglePanel,
    setWidth,
    create,
    selectDirectory,
    currentDirectory,
    scheduleTitleSync,
    syncTitle,
    write,
    resize,
    close,
    busy,
    rename,
    resetTitle,
    moveTab,
    setTabOrder,
    registerController,
    controller,
    buffer,
    outputs
  };
});
