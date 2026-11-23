// @vitest-environment jsdom
/**
 * 记忆设置：冲突分组、来源标题与开关交互。
 */
import { createApp, h, nextTick } from 'vue';
import { NMessageProvider } from 'naive-ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MemoryItem } from '@shared/memory';

const memory = (overrides: Partial<MemoryItem>): MemoryItem => ({
  id: 'memory-1',
  kind: 'preference',
  title: '回答风格',
  content: '偏好简洁中文回答。',
  status: 'active',
  priority: 50,
  createdAt: 1,
  updatedAt: 1,
  ...overrides
});

const api = vi.hoisted(() => ({
  listMemories: vi.fn(async () => [
    memory({ id: 'normal', title: '包管理器', content: '优先使用 pnpm。', kind: 'fact' }),
    memory({ id: 'conflict-a', content: '偏好简洁回答。', sourceSessionTitle: 'Fix login' }),
    memory({ id: 'conflict-b', content: '偏好详细回答。' }),
    memory({ id: 'proposed', status: 'proposed', title: '待确认' })
  ]),
  getMemorySettings: vi.fn(async () => ({ autoCapture: true, retrieval: true })),
  setMemorySettings: vi.fn(async () => ({ autoCapture: false, retrieval: true })),
  removeMemory: vi.fn(async () => true),
  rebuildMemoryIndex: vi.fn(async () => true),
  subscribeMemoryChanges: vi.fn(() => () => undefined)
}));

vi.mock('@/app/memory.api', () => api);

import MemorySettings from './MemorySettings.vue';

const flush = async (): Promise<void> => {
  await nextTick();
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
};

const mountSettings = (): { host: HTMLElement; app: ReturnType<typeof createApp> } => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({
    render: () =>
      h(NMessageProvider, null, {
        default: () => h(MemorySettings)
      })
  });
  app.mount(host);
  return { host, app };
};

describe('MemorySettings', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    api.setMemorySettings.mockClear();
  });

  it('separates conflicts from the normal list and shows source titles', async () => {
    const { host, app } = mountSettings();
    await flush();

    expect(host.querySelectorAll('.nh-memory__conflict-row')).toHaveLength(2);
    expect(host.querySelector('.nh-memory__list')?.textContent).toContain('包管理器');
    expect(host.querySelector('.nh-memory__list')?.textContent).not.toContain('回答风格');
    expect(host.querySelector('.nh-memory__conflicts')?.textContent).toContain('Fix login');
    expect(host.textContent).not.toContain('待确认');
    app.unmount();
  });

  it('persists setting changes through the memory API', async () => {
    const { host, app } = mountSettings();
    await flush();

    const switches = host.querySelectorAll<HTMLElement>('.n-switch');
    switches[0]?.click();
    await flush();

    expect(api.setMemorySettings).toHaveBeenCalledWith({ autoCapture: false, retrieval: true });
    app.unmount();
  });
});
