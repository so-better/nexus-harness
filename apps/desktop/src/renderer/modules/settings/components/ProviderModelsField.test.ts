// @vitest-environment jsdom
/**
 * 模型配置：模型级 reasoning 回传开关可见。
 */
import { createApp, h, nextTick, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import ProviderModelsField from './ProviderModelsField.vue';

describe('ProviderModelsField', () => {
  it('blocks invalid model extra JSON and recovers after correction', async () => {
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
          protocol: 'openai',
          'onUpdate:valid': (value: boolean) => {
            valid = value;
          }
        })
    });
    app.mount(host);
    await nextTick();
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea');
    if (!textarea) throw new Error('model extra textarea not found');

    textarea.value = '{';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(valid).toBe(false);
    expect(host.textContent).toContain('必须是 JSON 对象');

    textarea.value = '{"custom":true}';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(valid).toBe(true);
    expect(host.textContent).not.toContain('必须是 JSON 对象');
    app.unmount();
    document.body.innerHTML = '';
  });

  it('blocks managed thinking keys in model extra JSON', async () => {
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
              maxOutputTokens: 8_192
            }
          ],
          availableModels: ['model-a'],
          defaultModelId: 'model-a',
          testing: false,
          protocol: 'openai',
          'onUpdate:valid': (value: boolean) => {
            valid = value;
          }
        })
    });
    app.mount(host);
    await nextTick();
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea');
    if (!textarea) throw new Error('model extra textarea not found');
    textarea.value = '{"thinking":{"type":"disabled"}}';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(valid).toBe(false);
    expect(host.textContent).toContain('thinking / reasoning_effort');
    app.unmount();
    document.body.innerHTML = '';
  });

  it('clears invalid JSON state when the model is removed', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const models = ref([
      {
        id: 'model-a',
        contextWindow: 128_000,
        maxOutputTokens: 4_096
      }
    ]);
    const availableModels = ref(['model-a']);
    let valid = true;
    const app = createApp({
      render: () =>
        h(ProviderModelsField, {
          models: models.value,
          availableModels: availableModels.value,
          defaultModelId: 'model-a',
          testing: false,
          protocol: 'openai',
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
    if (!textarea) throw new Error('model extra textarea not found');
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

    expect(host.textContent).toContain('思考模式');
    expect(host.textContent).toContain('思考强度');
    expect(host.textContent).toContain('回传思考');
    expect(host.querySelectorAll('.n-select')).toHaveLength(1);
    expect(host.querySelectorAll('.n-checkbox')).toHaveLength(2);
    expect(host.querySelectorAll('[role="switch"]')).toHaveLength(2);
    app.unmount();
    document.body.innerHTML = '';
  });
});
