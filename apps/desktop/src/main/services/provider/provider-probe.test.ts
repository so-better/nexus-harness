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
