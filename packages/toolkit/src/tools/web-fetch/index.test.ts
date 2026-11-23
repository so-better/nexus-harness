/**
 * AnySearch 网页正文读取：协议校验、匿名访问与内容截断。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookup } from 'node:dns/promises';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34' }])
}));
const lookupMock = vi.mocked(lookup);
import { fetchWeb } from './index';

afterEach(() => {
  vi.unstubAllGlobals();
  lookupMock.mockReset();
  lookupMock.mockResolvedValue([{ address: '93.184.216.34' }] as never);
});

describe('fetchWeb', () => {
  it('reads a page anonymously and truncates long content', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          data: {
            url: 'https://example.com/page',
            title: 'Example',
            content: 'x'.repeat(25_000)
          }
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const output = JSON.parse(await fetchWeb('https://example.com/page')) as {
      url: string;
      title: string;
      content: string;
    };
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(output.url).toBe('https://example.com/page');
    expect(output.title).toBe('Example');
    expect(output.content).toHaveLength(20_000);
  });

  it('rejects private and non-http URLs before making a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchWeb('file:///tmp/page.html')).rejects.toThrow('只支持 http/https');
    await expect(fetchWeb('http://127.0.0.1/private')).rejects.toThrow('禁止访问本机地址');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
