// @vitest-environment jsdom
/**
 * 记忆候选：保存后保留短时间已保存状态，再移除卡片。
 */
import { createApp, h, nextTick } from 'vue';
import { NMessageProvider } from 'naive-ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MemoryItem } from '@shared/memory';

const api = vi.hoisted(() => ({
  listMemories: vi.fn(async () => [
    {
      id: 'candidate-1',
      kind: 'preference',
      title: '回答风格',
      content: '偏好简洁中文回答。',
      status: 'proposed',
      priority: 50,
      createdAt: 1,
      updatedAt: 1
    } satisfies MemoryItem
  ]),
  updateMemory: vi.fn(async () => ({})),
  removeMemory: vi.fn(async () => true),
  subscribeMemoryCandidateEvents: vi.fn(() => () => undefined)
}));

vi.mock('@/app/memory.api', () => api);

import MemoryCandidates from './MemoryCandidates.vue';

const flush = async (): Promise<void> => {
  await nextTick();
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
};

const flushTicks = async (): Promise<void> => {
  await nextTick();
  await nextTick();
  await Promise.resolve();
};

describe('MemoryCandidates', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
    api.updateMemory.mockClear();
  });

  it('shows saved state briefly before removing the card', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({
      render: () =>
        h(NMessageProvider, null, {
          default: () => h(MemoryCandidates, { running: false })
        })
    });
    app.mount(host);
    await flush();
    vi.useFakeTimers();

    const buttons = [
      ...host.querySelectorAll<HTMLButtonElement>('.nh-memory-candidates__actions button')
    ];
    buttons.at(-1)?.click();
    await flushTicks();

    expect(api.updateMemory).toHaveBeenCalledWith({ id: 'candidate-1', status: 'active' });
    expect(host.textContent).toContain('记忆已保存');

    vi.advanceTimersByTime(2_500);
    await flushTicks();
    expect(host.querySelector('.nh-memory-candidates')).toBeNull();
    app.unmount();
  });
});
