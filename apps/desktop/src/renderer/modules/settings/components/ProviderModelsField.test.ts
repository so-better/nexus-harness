// @vitest-environment jsdom
/**
 * 模型配置：思考模式只对 DeepSeek thinking 能力显示。
 */
import { createApp, h, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import type { ProviderModel } from '@shared/ipc/contracts';
import ProviderModelsField from './ProviderModelsField.vue';

const model = (overrides: Partial<ProviderModel> = {}): ProviderModel => ({
  id: 'deepseek-flash',
  contextWindow: 128_000,
  maxOutputTokens: 4_096,
  thinkingMode: 'default',
  reasoningEffort: 'default',
  ...overrides
});

const mount = async (options: {
  protocol: 'openai' | 'anthropic' | 'ollama';
  baseUrl: string;
  selected: ProviderModel;
}): Promise<{ host: HTMLElement; app: ReturnType<typeof createApp> }> => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({
    render: () =>
      h(ProviderModelsField, {
        models: [options.selected],
        availableModels: [options.selected.id],
        defaultModelId: options.selected.id,
        testing: false,
        protocol: options.protocol,
        baseUrl: options.baseUrl
      })
  });
  app.mount(host);
  await nextTick();
  await nextTick();
  return { host, app };
};

describe('ProviderModelsField thinking controls', () => {
  it('shows thinking controls for DeepSeek OpenAI-compatible models', async () => {
    const { host, app } = await mount({
      protocol: 'openai',
      baseUrl: 'https://api.deepseek.com',
      selected: model()
    });

    expect(host.textContent).toContain('思考模式');
    expect(host.textContent).toContain('思考强度');
    expect(host.querySelectorAll('.n-select')).toHaveLength(2);
    app.unmount();
    document.body.innerHTML = '';
  });

  it('hides thinking controls for non-DeepSeek models', async () => {
    const { host, app } = await mount({
      protocol: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      selected: model({ id: 'gpt-4.1' })
    });

    expect(host.textContent).not.toContain('思考模式');
    expect(host.querySelectorAll('.n-select')).toHaveLength(0);
    app.unmount();
    document.body.innerHTML = '';
  });

  it('hides thinking controls for Anthropic', async () => {
    const { host, app } = await mount({
      protocol: 'anthropic',
      baseUrl: 'https://api.deepseek.com',
      selected: model()
    });

    expect(host.textContent).not.toContain('思考模式');
    expect(host.querySelectorAll('.n-select')).toHaveLength(0);
    app.unmount();
    document.body.innerHTML = '';
  });
});
