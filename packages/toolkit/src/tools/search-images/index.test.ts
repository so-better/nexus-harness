/**
 * search_images 测试：Pexels 结果映射与 Key 校验。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchImages } from './index';

afterEach(() => vi.unstubAllGlobals());

describe('search_images', () => {
  it('maps Pexels photos and sends authorization', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          total_results: 1,
          photos: [
            {
              url: 'https://www.pexels.com/photo/1',
              photographer: 'Alice',
              alt: 'A cat',
              src: { large: 'https://img.example/large.jpg' }
            }
          ]
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const output = JSON.parse(await searchImages('cat', 2, 'key')) as {
      results: Array<Record<string, string>>;
    };
    expect(output.results[0]).toMatchObject({
      title: 'A cat',
      url: 'https://img.example/large.jpg',
      creator: 'Alice',
      source: 'pexels'
    });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({ authorization: 'key' })
    });
  });

  it('requires an API key', async () => {
    await expect(searchImages('cat', 1)).rejects.toThrow('未配置 Pexels API Key');
  });
});
