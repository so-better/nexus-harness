/**
 * Provider 探测测试：模型列表、认证失败与无效响应。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeProvider } from './provider-probe';

const config = {
  baseUrl: 'https://example.com/v1',
  apiKey: 'secret'
};

describe('probeProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns unique sorted model ids', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: [{ id: 'gpt-b' }, { id: 'gpt-a' }, { id: 'gpt-a' }, { invalid: true }]
        })
      }))
    );

    const result = await probeProvider(config);

    expect(result.models).toEqual(['gpt-a', 'gpt-b']);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('falls back to the OpenAI models endpoint for the DeepSeek Anthropic base URL', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.endsWith('/anthropic/v1/models')) return { ok: false, status: 404 };
        return {
          ok: true,
          json: async () => ({
            data: [{ id: 'deepseek-flash' }, { id: 'deepseek-v4-pro' }]
          })
        };
      })
    );

    const result = await probeProvider({
      protocol: 'anthropic',
      baseUrl: 'https://api.deepseek.com/anthropic',
      apiKey: 'secret'
    });

    expect(result.models).toEqual(['deepseek-flash', 'deepseek-v4-pro']);
    expect(calls).toEqual([
      'https://api.deepseek.com/anthropic/v1/models',
      'https://api.deepseek.com/models'
    ]);
  });

  it('maps unauthorized responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 401 }))
    );

    await expect(probeProvider(config)).rejects.toMatchObject({
      code: 'PROVIDER_UNAUTHORIZED'
    });
  });

  it('maps invalid responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => {
          throw new Error('bad json');
        }
      }))
    );

    await expect(probeProvider(config)).rejects.toMatchObject({
      code: 'PROVIDER_INVALID_RESPONSE'
    });
  });
});
