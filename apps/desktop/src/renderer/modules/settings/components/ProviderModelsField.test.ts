// @vitest-environment jsdom
/**
 * 模型配置：模型级 reasoning 回传开关可见。
 */
import { createApp, h, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import ProviderModelsField from './ProviderModelsField.vue';

describe('ProviderModelsField', () => {
  it('hides reasoning passback for Anthropic', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({
      render: () =>
        h(ProviderModelsField, {
          models: [
            {
              id: 'claude-test',
              contextWindow: 128_000,
              maxOutputTokens: 4_096
            }
          ],
          availableModels: ['claude-test'],
          defaultModelId: 'claude-test',
          testing: false,
          protocol: 'anthropic'
        })
    });
    app.mount(host);
    await nextTick();
    await nextTick();

    expect(host.textContent).not.toContain('回传 reasoning');
    app.unmount();
    document.body.innerHTML = '';
  });

  it('shows the generic reasoning passback switch for a selected model', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({
      render: () =>
        h(ProviderModelsField, {
          models: [
            {
              id: 'model-a',
              contextWindow: 128_000,
              maxOutputTokens: 4_096,
              reasoningPassback: true
            }
          ],
          availableModels: ['model-a'],
          defaultModelId: 'model-a',
          testing: false,
          protocol: 'openai'
        })
    });
    app.mount(host);
    await nextTick();
    await nextTick();

    expect(host.textContent).toContain('回传 reasoning');
    expect(host.querySelectorAll('.n-checkbox')).toHaveLength(3);
    app.unmount();
    document.body.innerHTML = '';
  });
});
