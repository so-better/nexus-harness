// @vitest-environment jsdom
/**
 * 缓存设置：展示 AI 文件、产物、日志与 MCP 运行缓存。
 */
import { createApp, h, nextTick } from 'vue';
import { NMessageProvider } from 'naive-ui';
import { afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getCacheInfo: vi.fn(async () => ({
    filesBytes: 1,
    artifactsBytes: 2,
    logsBytes: 3,
    mcpBytes: 4,
    totalBytes: 10,
    failed: []
  })),
  clearCache: vi.fn(async () => ({
    filesBytes: 0,
    artifactsBytes: 0,
    logsBytes: 0,
    mcpBytes: 0,
    totalBytes: 0,
    failed: []
  }))
}));

vi.mock('../api/settings.api', () => api);

import CacheSettings from './CacheSettings.vue';

const flush = async (): Promise<void> => {
  await nextTick();
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
};

describe('CacheSettings', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    api.getCacheInfo.mockClear();
  });

  it('shows the MCP runtime cache row and total size', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({
      render: () =>
        h(NMessageProvider, null, {
          default: () => h(CacheSettings, { busy: false })
        })
    });
    app.mount(host);
    await flush();

    expect(host.querySelectorAll('.nh-cache__row')).toHaveLength(4);
    expect(host.textContent).toContain('MCP');
    expect(host.querySelector('.nh-cache__summary-size')?.textContent).toContain('10 B');
    app.unmount();
  });
});
