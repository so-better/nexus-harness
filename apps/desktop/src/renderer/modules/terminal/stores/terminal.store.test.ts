// @vitest-environment jsdom
/**
 * 终端 store 测试：标签排序同步与失败反馈。
 */

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TerminalEvent, TerminalSessionPublic } from '@shared/ipc/contracts';

const reorderTerminals = vi.hoisted(() => vi.fn());
vi.mock('../api/terminal.api', () => ({
  busyTerminals: vi.fn(),
  closeTerminal: vi.fn(),
  createTerminal: vi.fn(),
  currentTerminalDirectory: vi.fn(),
  getTerminalSettings: vi.fn(),
  listTerminals: vi.fn(),
  resizeTerminal: vi.fn(),
  selectTerminalDirectory: vi.fn(),
  subscribeTerminalSettings: vi.fn(),
  subscribeTerminalEvents: vi.fn(),
  updateTerminalTitle: vi.fn(),
  writeTerminal: vi.fn(),
  reorderTerminals
}));

import {
  getTerminalSettings,
  listTerminals,
  subscribeTerminalEvents,
  subscribeTerminalSettings
} from '../api/terminal.api';
import { useTerminalStore } from './terminal.store';

const terminal = (id: string): TerminalSessionPublic => ({
  id,
  sessionId: 'session-1',
  title: id,
  cwd: '/tmp',
  shell: '/bin/zsh',
  customTitle: false,
  pid: 100,
  status: 'running',
  source: 'user',
  createdAt: 1
});

describe('terminal store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    reorderTerminals.mockReset();
    reorderTerminals.mockResolvedValue(true);
  });

  it('updates local order and persists it to the main process', async () => {
    const store = useTerminalStore();
    store.tabs = [terminal('a'), terminal('b')];

    await expect(store.setTabOrder([terminal('b'), terminal('a')])).resolves.toBe(true);
    expect(store.tabs.map((item) => item.id)).toEqual(['b', 'a']);
    expect(reorderTerminals).toHaveBeenCalledWith(['b', 'a']);
  });

  it('applies updated terminal metadata and hides the panel when the last tab closes', () => {
    const store = useTerminalStore();
    let handler: ((event: TerminalEvent) => void) | undefined;
    vi.mocked(subscribeTerminalEvents).mockImplementation(
      (next: (event: TerminalEvent) => void) => {
        handler = next;
        return () => undefined;
      }
    );
    vi.mocked(subscribeTerminalSettings).mockReturnValue(() => undefined);
    vi.mocked(getTerminalSettings).mockResolvedValue({
      shell: null,
      fontSize: 12,
      scrollback: 1000,
      copyOnSelect: false,
      webgl: false
    });
    vi.mocked(listTerminals).mockResolvedValue([]);
    store.tabs = [terminal('a')];
    store.open = true;
    store.init();

    handler?.({ type: 'updated', terminal: { ...terminal('a'), title: '新标题', pid: 200 } });
    expect(store.tabs[0]?.title).toBe('新标题');
    expect(store.open).toBe(true);

    handler?.({ type: 'closed', id: 'a', sessionId: 'session-1' });
    expect(store.tabs).toEqual([]);
    expect(store.open).toBe(false);
  });

  it('keeps the local order and reports an error when persistence fails', async () => {
    const store = useTerminalStore();
    store.tabs = [terminal('a'), terminal('b')];
    reorderTerminals.mockRejectedValueOnce(new Error('disk unavailable'));

    await expect(store.setTabOrder([terminal('b'), terminal('a')])).resolves.toBe(false);
    expect(store.tabs.map((item) => item.id)).toEqual(['b', 'a']);
    expect(store.error).toBe('disk unavailable');
  });
});
