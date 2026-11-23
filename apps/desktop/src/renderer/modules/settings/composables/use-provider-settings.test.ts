// @vitest-environment jsdom
/**
 * Provider 表单状态：协议切换时恢复非 Anthropic 的回传设置。
 */
import { createApp, h, nextTick } from 'vue';
import { NMessageProvider } from 'naive-ui';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/settings.api', () => ({
  listProviders: vi.fn(async () => []),
  removeProvider: vi.fn(async () => undefined),
  saveProvider: vi.fn(async (input: unknown) => input),
  testProvider: vi.fn(async () => ({ models: [], latencyMs: 0 }))
}));

import { useProviderSettings } from './use-provider-settings';

const flush = async (): Promise<void> => {
  await nextTick();
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('useProviderSettings', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('restores non-Anthropic passback after switching protocols', async () => {
    let state: ReturnType<typeof useProviderSettings> | undefined;
    const Host = {
      setup() {
        state = useProviderSettings(() => undefined);
        return () => h('div');
      }
    };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({
      render: () => h(NMessageProvider, null, { default: () => h(Host) })
    });
    app.mount(host);
    await flush();
    if (!state) throw new Error('provider settings not initialized');

    state.providerForm.value.reasoningPassback = true;
    state.providerForm.value.protocol = 'anthropic';
    await flush();
    expect(state.providerForm.value.reasoningPassback).toBe(false);

    state.providerForm.value.protocol = 'ollama';
    await flush();
    expect(state.providerForm.value.reasoningPassback).toBe(true);

    state.providerForm.value.reasoningPassback = false;
    state.providerForm.value.protocol = 'openai';
    await flush();
    expect(state.providerForm.value.reasoningPassback).toBe(false);
    app.unmount();
  });

  it('keeps custom extra params across protocol changes', async () => {
    let state: ReturnType<typeof useProviderSettings> | undefined;
    const Host = {
      setup() {
        state = useProviderSettings(() => undefined);
        return () => h('div');
      }
    };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({
      render: () => h(NMessageProvider, null, { default: () => h(Host) })
    });
    app.mount(host);
    await flush();
    if (!state) throw new Error('provider settings not initialized');

    state.providerForm.value.extraParamsText = '{"custom":1}';
    state.providerForm.value.protocol = 'anthropic';
    await flush();
    expect(state.providerForm.value.extraParamsText).toBe('{"custom":1}');
    app.unmount();
  });
});
