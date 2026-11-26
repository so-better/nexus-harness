/**
 * Provider 配置存储测试：本地明文落盘、多模型、兼容迁移与删除。
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const encryption = vi.hoisted(() => ({ available: true }));

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => encryption.available,
    encryptString: (value: string) => Buffer.from(`enc:${value}`, 'utf8'),
    decryptString: (value: Buffer) => value.toString('utf8').replace(/^enc:/, '')
  }
}));

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
    encryption.available = true;
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

  it('persists protocol and allows keyless Ollama configs', async () => {
    const saved = await save({
      protocol: 'ollama',
      name: 'Ollama',
      baseUrl: 'http://127.0.0.1:11434/v1',
      apiKey: ''
    });

    expect(saved.protocol).toBe('ollama');
    expect(saved.apiKey).toBe('');
    const full = await store.get(saved.id);
    expect(full).toMatchObject({ protocol: 'ollama', apiKey: '' });
  });

  it('persists model-level extra params', async () => {
    const saved = await save({
      models: [{ ...model('gpt-test'), extraParams: { custom: 1 } }]
    });

    expect(saved.models[0]?.extraParams).toEqual({ custom: 1 });
    const full = await store.get(saved.id);
    expect(full?.models[0]?.extraParams).toEqual({ custom: 1 });
  });

  it('migrates legacy provider extra params into models', async () => {
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, 'providers.json'),
      JSON.stringify({
        version: 1,
        providers: [
          {
            id: 'legacy-extra',
            name: 'Legacy',
            baseUrl: 'https://example.com/v1',
            enabled: true,
            apiKey: 'secret',
            extraParams: { thinking: { type: 'enabled' } },
            models: [model('legacy-model')],
            defaultModelId: 'legacy-model'
          }
        ]
      })
    );

    const providers = await store.list();
    expect(providers[0]?.models[0]?.extraParams).toEqual({
      thinking: { type: 'enabled' }
    });
    const raw = JSON.parse(await readFile(join(directory, 'providers.json'), 'utf8')) as {
      providers: Array<Record<string, unknown>>;
    };
    expect(raw.providers[0]).not.toHaveProperty('extraParams');
    expect(raw.providers[0]?.['models']).toEqual([
      expect.objectContaining({ extraParams: { thinking: { type: 'enabled' } } })
    ]);
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

  it('drops legacy thinking fields but keeps reasoning passback config', async () => {
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, 'providers.json'),
      JSON.stringify({
        version: 1,
        providers: [
          {
            id: 'legacy-thinking',
            name: 'Legacy',
            baseUrl: 'https://example.com/v1',
            enabled: true,
            apiKey: 'secret',
            models: [
              {
                ...model('deepseek-flash'),
                thinkingMode: 'disabled',
                reasoningEffort: 'high',
                reasoningPassback: true,
                reasoningField: 'reasoning'
              }
            ],
            defaultModelId: 'deepseek-flash'
          }
        ]
      })
    );

    const providers = await store.list();
    expect(providers[0]?.models[0]).toMatchObject({
      reasoningPassback: true,
      reasoningField: 'reasoning'
    });

    const raw = JSON.parse(await readFile(join(directory, 'providers.json'), 'utf8')) as {
      providers: Array<{ models: Array<Record<string, unknown>> }>;
    };
    const stored = raw.providers[0]?.models[0] ?? {};
    expect(stored).not.toHaveProperty('thinkingMode');
    expect(stored).not.toHaveProperty('reasoningEffort');
    expect(stored['reasoningPassback']).toBe(true);
    expect(stored['reasoningField']).toBe('reasoning');
  });

  it('stores custom headers locally and keeps them out of public configs', async () => {
    const saved = await save({ headers: { Authorization: 'Bearer header-secret' } });

    expect(saved).not.toHaveProperty('headers');
    const raw = await readFile(join(directory, 'providers.json'), 'utf8');
    expect(raw).toContain('header-secret');

    const full = await store.get(saved.id);
    expect(full?.headers).toEqual({ Authorization: 'Bearer header-secret' });
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

  it('migrates legacy single-model providers', async () => {
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, 'providers.json'),
      JSON.stringify({
        version: 1,
        providers: [
          {
            id: 'legacy',
            name: 'Legacy',
            baseUrl: 'https://example.com/v1',
            enabled: true,
            model: 'legacy-model',
            contextWindow: 32_000,
            maxOutputTokens: 4_000,
            encryptedApiKey: Buffer.from('enc:legacy-secret').toString('base64')
          }
        ]
      })
    );

    const providers = await store.list();

    expect(providers[0]?.models).toEqual([model('legacy-model', 32_000, 4_000)]);
    expect(providers[0]?.defaultModelId).toBe('legacy-model');
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

  it('migrates legacy encrypted values to plaintext', async () => {
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, 'providers.json'),
      JSON.stringify({
        version: 1,
        providers: [
          {
            id: 'legacy',
            name: 'Legacy',
            baseUrl: 'https://example.com/v1',
            enabled: true,
            models: [model('legacy-model')],
            defaultModelId: 'legacy-model',
            encryptedApiKey: Buffer.from('enc:legacy-secret').toString('base64')
          }
        ]
      })
    );

    await expect(store.list()).resolves.toMatchObject([{ apiKey: 'legacy-secret' }]);
    const raw = await readFile(join(directory, 'providers.json'), 'utf8');
    expect(raw).toContain('"apiKey": "legacy-secret"');
    expect(raw).not.toContain('encryptedApiKey');
  });
});
