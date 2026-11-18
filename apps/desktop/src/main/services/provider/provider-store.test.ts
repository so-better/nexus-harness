/**
 * Provider 配置存储测试：加密落盘、保留旧密钥与删除。
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
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

  it('stores the api key encrypted and returns it only to main', async () => {
    const saved = await store.save({
      name: 'OpenAI',
      baseUrl: 'https://example.com/v1',
      model: 'gpt-test',
      apiKey: 'secret'
    });

    expect(saved).not.toHaveProperty('apiKey');
    const raw = await readFile(join(directory, 'providers.json'), 'utf8');
    expect(raw).not.toContain('"secret"');

    const full = await store.get(saved.id);
    expect(full?.apiKey).toBe('secret');
  });

  it('encrypts custom headers and omits them from public configs', async () => {
    const saved = await store.save({
      name: 'OpenAI',
      baseUrl: 'https://example.com/v1',
      model: 'gpt-test',
      apiKey: 'secret',
      headers: { Authorization: 'Bearer header-secret' }
    });

    expect(saved).not.toHaveProperty('headers');
    const raw = await readFile(join(directory, 'providers.json'), 'utf8');
    expect(raw).not.toContain('header-secret');

    const full = await store.get(saved.id);
    expect(full?.headers).toEqual({ Authorization: 'Bearer header-secret' });
  });

  it('keeps the existing api key when updating without one', async () => {
    const saved = await store.save({
      name: 'OpenAI',
      baseUrl: 'https://example.com/v1',
      model: 'gpt-test',
      apiKey: 'secret'
    });

    const updated = await store.save({
      id: saved.id,
      name: 'OpenAI 2',
      baseUrl: 'https://example.com/v2',
      model: 'gpt-test-2'
    });

    expect(updated.name).toBe('OpenAI 2');
    const full = await store.get(saved.id);
    expect(full?.apiKey).toBe('secret');
  });

  it('persists context budget settings and applies defaults', async () => {
    const saved = await store.save({
      name: 'OpenAI',
      baseUrl: 'https://example.com/v1',
      model: 'gpt-test',
      apiKey: 'secret'
    });

    expect(saved.contextWindow).toBe(128_000);
    expect(saved.maxOutputTokens).toBe(4_096);

    const custom = await store.save({
      id: saved.id,
      name: 'OpenAI',
      baseUrl: 'https://example.com/v1',
      model: 'gpt-test',
      contextWindow: 32_000,
      maxOutputTokens: 8_000
    });

    expect(custom.contextWindow).toBe(32_000);
    expect(custom.maxOutputTokens).toBe(8_000);
  });

  it('rejects output reservations that leave no input budget', async () => {
    await expect(
      store.save({
        name: 'OpenAI',
        baseUrl: 'https://example.com/v1',
        model: 'gpt-test',
        apiKey: 'secret',
        contextWindow: 8_000,
        maxOutputTokens: 8_000
      })
    ).rejects.toThrow('maxOutputTokens');
  });

  it('removes providers', async () => {
    const saved = await store.save({
      name: 'OpenAI',
      baseUrl: 'https://example.com/v1',
      model: 'gpt-test',
      apiKey: 'secret'
    });

    await store.remove(saved.id);
    await expect(store.get(saved.id)).resolves.toBeUndefined();
    await expect(store.list()).resolves.toEqual([]);
  });

  it('fails when system encryption is unavailable', async () => {
    encryption.available = false;

    await expect(
      store.save({
        name: 'OpenAI',
        baseUrl: 'https://example.com/v1',
        model: 'gpt-test',
        apiKey: 'secret'
      })
    ).rejects.toThrow('系统安全存储不可用');
  });
});
