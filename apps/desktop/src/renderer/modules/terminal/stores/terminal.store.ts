/**
 * 终端面板状态：标签、尺寸、输出缓冲与 PTY 事件订阅。
 */

import { computed, reactive, ref } from 'vue';
import { defineStore } from 'pinia';
import type { TerminalEvent, TerminalSessionPublic } from '@shared/ipc/contracts';
import { TERMINAL_DEFAULT_WIDTH, clampTerminalWidth } from '../terminal-layout';
import {
  busyTerminals,
  closeTerminal,
  createTerminal,
  listTerminals,
  resizeTerminal,
  subscribeTerminalEvents,
  writeTerminal
} from '../api/terminal.api';

const MAX_BUFFER = 500_000;

export const useTerminalStore = defineStore('terminal', () => {
  const tabs = ref<TerminalSessionPublic[]>([]);
  const activeId = ref<string>();
  const open = ref(false);
  const mounted = ref(false);
  const ready = ref(false);
  const width = ref(clampTerminalWidth(TERMINAL_DEFAULT_WIDTH, window.innerWidth));
  const error = ref<string>();
  const outputs = reactive<Record<string, string>>({});
  let unsubscribe: (() => void) | undefined;

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
    if (activeId.value === id) activeId.value = tabs.value.at(-1)?.id;
  };

  const pushData = (id: string, data: string): void => {
    const next = `${outputs[id] ?? ''}${data}`;
    outputs[id] = next.length > MAX_BUFFER ? next.slice(-MAX_BUFFER) : next;
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
    window.addEventListener('resize', handleResize);
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

  const create = async (sessionId: string): Promise<boolean> => {
    try {
      error.value = undefined;
      await createTerminal(sessionId, 100, 30);
      openPanel();
      return true;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
      return false;
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
    if (tab && title.trim()) tab.title = title.trim();
  };

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
    init,
    openPanel,
    togglePanel,
    setWidth,
    create,
    write,
    resize,
    close,
    busy,
    rename,
    buffer,
    outputs
  };
});
