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
    expect(saved.reasoningPassback).toBe(true);
    expect(saved.extraParams).toEqual({ thinking: { type: 'enabled' } });
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

  it('persists generic reasoning params and passback capability', async () => {
    const saved = await save({
      reasoningPassback: true,
      extraParams: { thinking: { type: 'enabled' }, custom: 1 }
    });

    expect(saved.reasoningPassback).toBe(true);
    expect(saved.extraParams).toEqual({ thinking: { type: 'enabled' }, custom: 1 });
    const full = await store.get(saved.id);
    expect(full?.extraParams).toEqual({ thinking: { type: 'enabled' }, custom: 1 });
    expect(full?.reasoningPassback).toBe(true);
  });

  it('uses protocol-specific default thinking params', async () => {
    const openai = await save();
    expect(openai.extraParams).toEqual({ thinking: { type: 'enabled' } });

    const anthropic = await save({
      protocol: 'anthropic',
      name: 'Anthropic',
      models: [model('claude-test')],
      defaultModelId: 'claude-test'
    });
    expect(anthropic.extraParams).toBeUndefined();
    expect(anthropic.reasoningPassback).toBe(false);

    const ollama = await save({
      protocol: 'ollama',
      name: 'Ollama',
      baseUrl: 'http://127.0.0.1:11434/v1',
      models: [model('llama-test')],
      defaultModelId: 'llama-test'
    });
    expect(ollama.extraParams).toBeUndefined();
    expect(ollama.reasoningPassback).toBe(true);
  });

  it('rejects reserved and sensitive extra params', async () => {
    await expect(save({ extraParams: { model: 'override' } })).rejects.toThrow('保留字段');
    await expect(save({ extraParams: { api_key: 'secret' } })).rejects.toThrow('敏感字段');
  });

  it('migrates legacy model thinking fields to provider params', async () => {
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
                reasoningEffort: 'high'
              }
            ],
            defaultModelId: 'deepseek-flash'
          }
        ]
      })
    );

    const providers = await store.list();
    expect(providers[0]).toMatchObject({
      reasoningPassback: true,
      extraParams: {
        thinking: { type: 'disabled' },
        reasoning_effort: 'high'
      }
    });
    expect(providers[0]?.models[0]).not.toHaveProperty('thinkingMode');
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
