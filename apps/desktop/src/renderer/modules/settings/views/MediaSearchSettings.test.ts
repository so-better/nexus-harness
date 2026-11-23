// @vitest-environment jsdom
/**
 * 搜索设置：Pexels 与 AnySearch 的 Key 分别保存，互不覆盖。
 */
import { createApp, h, nextTick } from 'vue';
import { NMessageProvider } from 'naive-ui';
import { afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getSearchSettings: vi.fn(async () => ({
    pexelsApiKey: 'pexels-key',
    anysearchApiKey: 'anysearch-key'
  })),
  setSearchSettings: vi.fn(async (value: unknown) => value),
  openExternalLink: vi.fn(async () => undefined)
}));

vi.mock('../api/settings.api', () => api);

import MediaSearchSettings from './MediaSearchSettings.vue';

const flush = async (): Promise<void> => {
  await nextTick();
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
};

const mount = (): { host: HTMLElement; app: ReturnType<typeof createApp> } => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({
    render: () =>
      h(NMessageProvider, null, {
        default: () => h(MediaSearchSettings)
      })
  });
  app.mount(host);
  return { host, app };
};

describe('MediaSearchSettings', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    api.setSearchSettings.mockClear();
  });

  it('saves each search key independently', async () => {
    const { host, app } = mount();
    await flush();

    expect(host.textContent).toContain('媒体搜索');
    expect(host.textContent).toContain('联网搜索');
    const buttons = host.querySelectorAll<HTMLButtonElement>('.nh-media__form button');
    expect(buttons).toHaveLength(2);
    buttons[0]?.click();
    await flush();
    buttons[1]?.click();
    await flush();

    expect(api.setSearchSettings).toHaveBeenCalledTimes(2);
    expect(api.setSearchSettings).toHaveBeenNthCalledWith(1, {
      pexelsApiKey: 'pexels-key',
      anysearchApiKey: 'anysearch-key'
    });
    expect(api.setSearchSettings).toHaveBeenNthCalledWith(2, {
      pexelsApiKey: 'pexels-key',
      anysearchApiKey: 'anysearch-key'
    });
    app.unmount();
  });

  it('clears one key without removing the other', async () => {
    const { host, app } = mount();
    await flush();

    const inputs = host.querySelectorAll<HTMLInputElement>('.nh-media__form input');
    inputs[1]!.value = '';
    inputs[1]!.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    host.querySelectorAll<HTMLButtonElement>('.nh-media__form button')[1]?.click();
    await flush();

    expect(api.setSearchSettings).toHaveBeenCalledWith({ pexelsApiKey: 'pexels-key' });
    app.unmount();
  });
});
