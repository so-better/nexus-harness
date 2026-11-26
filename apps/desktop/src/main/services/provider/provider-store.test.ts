/**
 * Provider 配置存储测试：本地明文落盘、多模型与删除。
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProviderStore } from './provider-store';

const model = (id: string, contextWindow = 128_000, maxOutputTokens = 4_096) => ({
  id,
  contextWindow,
  maxOutputTokens
});

describe('ProviderStore', () => {
  let directory = '';
  let store: ProviderStore;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nexus-provider-'));
    store = new ProviderStore(directory);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const save = (overrides: Record<string, unknown> = {}) =>
    store.save({
      name: 'OpenAI',
      baseUrl: 'https://example.com/v1',
      apiKey: 'secret',
      models: [model('gpt-test')],
      defaultModelId: 'gpt-test',
      ...overrides
    });

  it('stores the api key locally and returns it for editing', async () => {
    const saved = await save();

    expect(saved.apiKey).toBe('secret');
    const raw = await readFile(join(directory, 'providers.json'), 'utf8');
    expect(raw).toContain('"apiKey": "secret"');

    const full = await store.get(saved.id);
    expect(full?.apiKey).toBe('secret');
    expect(full?.models).toEqual([model('gpt-test')]);
  });

  it('persists protocol', async () => {
    const saved = await save({
      protocol: 'anthropic',
      name: 'Anthropic',
      baseUrl: 'https://api.anthropic.com'
    });

    expect(saved.protocol).toBe('anthropic');
    const full = await store.get(saved.id);
    expect(full?.protocol).toBe('anthropic');
  });

  it('persists model-level extra params', async () => {
    const saved = await save({
      models: [{ ...model('gpt-test'), extraParams: { custom: 1 } }]
    });

    expect(saved.models[0]?.extraParams).toEqual({ custom: 1 });
    const full = await store.get(saved.id);
    expect(full?.models[0]?.extraParams).toEqual({ custom: 1 });
  });

  it('allows thinking params in model extra params', async () => {
    // thinking / reasoning_effort 直接写在模型 JSON 中，不再由宿主托管
    const saved = await save({
      models: [{ ...model('gpt-test'), extraParams: { thinking: { type: 'disabled' } } }]
    });
    expect(saved.models[0]?.extraParams).toEqual({ thinking: { type: 'disabled' } });

    const anthropic = await save({
      name: 'Anthropic',
      models: [
        {
          ...model('claude-test'),
          extraParams: { thinking: { type: 'enabled', budget_tokens: 1024 } }
        }
      ],
      defaultModelId: 'claude-test'
    });
    expect(anthropic.models[0]?.extraParams).toEqual({
      thinking: { type: 'enabled', budget_tokens: 1024 }
    });
  });

  it('rejects reserved reasoning field names', async () => {
    await expect(
      save({ models: [{ ...model('gpt-test'), reasoningField: 'content' }] })
    ).rejects.toThrow('思考内容字段不合法');
  });

  it('rejects reserved and sensitive model extra params', async () => {
    await expect(
      save({ models: [{ ...model('gpt-test'), extraParams: { model: 'override' } }] })
    ).rejects.toThrow('保留字段');
    await expect(
      save({ models: [{ ...model('gpt-test'), extraParams: { api_key: 'secret' } }] })
    ).rejects.toThrow('敏感字段');
  });

  it('stores custom headers locally and returns them for editing', async () => {
    const saved = await save({ headers: { Authorization: 'Bearer header-secret' } });

    expect(saved.headers).toEqual({ Authorization: 'Bearer header-secret' });
    const raw = await readFile(join(directory, 'providers.json'), 'utf8');
    expect(raw).toContain('header-secret');

    const full = await store.get(saved.id);
    expect(full?.headers).toEqual({ Authorization: 'Bearer header-secret' });
  });

  it('clears headers when saved empty', async () => {
    const saved = await save({ headers: { Authorization: 'Bearer x' } });
    const cleared = await store.save({
      id: saved.id,
      name: saved.name,
      baseUrl: saved.baseUrl,
      models: saved.models,
      defaultModelId: saved.defaultModelId,
      headers: {}
    });

    expect(cleared.headers).toBeUndefined();
    const full = await store.get(saved.id);
    expect(full).not.toHaveProperty('headers');
  });

  it('keeps the existing api key when updating without one', async () => {
    const saved = await save();

    const updated = await store.save({
      id: saved.id,
      name: 'OpenAI 2',
      baseUrl: 'https://example.com/v2',
      models: [model('gpt-test-2', 32_000, 8_000)],
      defaultModelId: 'gpt-test-2'
    });

    expect(updated.name).toBe('OpenAI 2');
    expect(updated.models[0]?.id).toBe('gpt-test-2');
    const full = await store.get(saved.id);
    expect(full?.apiKey).toBe('secret');
  });

  it('preserves multiple models and default selection', async () => {
    const saved = await save({
      models: [model('gpt-a'), model('gpt-b', 64_000, 8_000)],
      defaultModelId: 'gpt-b'
    });

    expect(saved.models.map((item) => item.id)).toEqual(['gpt-a', 'gpt-b']);
    expect(saved.defaultModelId).toBe('gpt-b');
  });

  it('removes providers', async () => {
    const saved = await save();

    await store.remove(saved.id);
    await expect(store.get(saved.id)).resolves.toBeUndefined();
    await expect(store.list()).resolves.toEqual([]);
  });

});
