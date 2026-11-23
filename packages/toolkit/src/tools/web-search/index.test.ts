/**
 * AnySearch 联网搜索：匿名、带 Key 与错误处理。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchWeb } from './index';

afterEach(() => {
  vi.unstubAllGlobals();
});

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });

describe('searchWeb', () => {
  it('uses anonymous access when no key is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        code: 0,
        message: 'success',
        data: {
          results: [
            {
              title: 'Nexus',
              url: 'https://example.com/nexus',
              snippet: 'Nexus harness'
            }
          ]
        }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const output = await searchWeb('nexus harness', 5);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(JSON.parse(output)).toEqual({
      query: 'nexus harness',
      results: [
        {
          title: 'Nexus',
          url: 'https://example.com/nexus',
          snippet: 'Nexus harness'
        }
      ]
    });
  });

  it('returns an empty list when the API omits data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ code: 0, data: null })));

    expect(JSON.parse(await searchWeb('empty', 5))).toEqual({
      query: 'empty',
      results: []
    });
  });

  it('includes Retry-After when the API is rate limited', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: -1, message: 'Rate limited' }), {
          status: 429,
          headers: {
            'content-type': 'application/json',
            'retry-after': '12'
          }
        })
      )
    );

    await expect(searchWeb('limited', 1)).rejects.toThrow('请在 12 秒后重试');
  });

  it('sends the optional API key and reports API errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          code: 0,
          data: { results: [{ title: 'A', url: 'https://example.com/a', snippet: 'a' }] }
        })
      )
      .mockResolvedValueOnce(response({ code: -1, message: 'Rate limited' }, 429));
    vi.stubGlobal('fetch', fetchMock);

    await searchWeb('a', 1, 'as_sk_test');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer as_sk_test');

    await expect(searchWeb('b', 1)).rejects.toThrow('Rate limited');
  });
});
