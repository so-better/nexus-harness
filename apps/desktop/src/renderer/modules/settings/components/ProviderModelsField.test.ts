// @vitest-environment jsdom
/**
 * 模型配置：每个模型只使用一个 JSON 编辑器。
 */
import { createApp, h, nextTick, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import type { ProviderModel } from '@shared/ipc/contracts';
import ProviderModelsField from './ProviderModelsField.vue';

describe('ProviderModelsField', () => {
  it('blocks invalid model JSON and recovers after correction', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let valid = true;
    const app = createApp({
      render: () =>
        h(ProviderModelsField, {
          models: [
            {
              id: 'model-a',
              contextWindow: 128_000,
              maxOutputTokens: 4_096
            }
          ],
          availableModels: ['model-a'],
          defaultModelId: 'model-a',
          testing: false,
          'onUpdate:valid': (value: boolean) => {
            valid = value;
          }
        })
    });
    app.mount(host);
    await nextTick();
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea');
    if (!textarea) throw new Error('model config textarea not found');

    textarea.value = '{';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(valid).toBe(false);
    expect(host.textContent).toContain('模型额外参数必须是 JSON 对象');

    textarea.value = '{"custom":true}';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(valid).toBe(true);
    expect(host.textContent).not.toContain('模型额外参数必须是 JSON 对象');
    app.unmount();
    document.body.innerHTML = '';
  });

  it('parses extra request params JSON as passthrough', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let updated: ProviderModel[] | undefined;
    const app = createApp({
      render: () =>
        h(ProviderModelsField, {
          models: [{ id: 'model-a', contextWindow: 128_000, maxOutputTokens: 4_096 }],
          availableModels: ['model-a'],
          defaultModelId: 'model-a',
          testing: false,
          'onUpdate:models': (value: ProviderModel[]) => {
            updated = value;
          }
        })
    });
    app.mount(host);
    await nextTick();
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea');
    if (!textarea) throw new Error('model config textarea not found');

    textarea.value = JSON.stringify({
      thinking: { type: 'enabled' },
      reasoning_effort: 'high'
    });
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();

    expect(updated?.[0]).toMatchObject({
      id: 'model-a',
      contextWindow: 128_000,
      maxOutputTokens: 4_096,
      extraParams: { thinking: { type: 'enabled' }, reasoning_effort: 'high' }
    });
    app.unmount();
    document.body.innerHTML = '';
  });

  it('clears invalid JSON state when the model is removed', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const models = ref([{ id: 'model-a', contextWindow: 128_000, maxOutputTokens: 4_096 }]);
    const availableModels = ref(['model-a']);
    let valid = true;
    const app = createApp({
      render: () =>
        h(ProviderModelsField, {
          models: models.value,
          availableModels: availableModels.value,
          defaultModelId: 'model-a',
          testing: false,
          'onUpdate:models': (value: typeof models.value) => {
            models.value = value;
          },
          'onUpdate:valid': (value: boolean) => {
            valid = value;
          }
        })
    });
    app.mount(host);
    await nextTick();
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea');
    if (!textarea) throw new Error('model config textarea not found');
    textarea.value = '{';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(valid).toBe(false);

    models.value = [];
    availableModels.value = [];
    await nextTick();
    await nextTick();
    expect(valid).toBe(true);
    app.unmount();
    document.body.innerHTML = '';
  });

  it('defaults DeepSeek models to a 1M context window', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let updated: ProviderModel[] | undefined;
    const app = createApp({
      render: () =>
        h(ProviderModelsField, {
          models: [],
          availableModels: ['deepseek-flash'],
          defaultModelId: '',
          testing: false,
          baseUrl: 'https://api.deepseek.com',
          'onUpdate:models': (value: ProviderModel[]) => {
            updated = value;
          }
        })
    });
    app.mount(host);
    await nextTick();

    // 第一个是「全选」，第二个是模型行复选框
    const checkbox = host.querySelectorAll<HTMLElement>('.n-checkbox')[1];
    if (!checkbox) throw new Error('model checkbox not found');
    checkbox.click();
    await nextTick();

    expect(updated?.[0]?.contextWindow).toBe(1_000_000);
    app.unmount();
    document.body.innerHTML = '';
  });
});
