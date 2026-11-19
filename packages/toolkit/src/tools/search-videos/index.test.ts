/**
 * search_videos 测试：优先选择 HD MP4。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchVideos } from './index';

afterEach(() => vi.unstubAllGlobals());

describe('search_videos', () => {
  it('maps Pexels videos', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            total_results: 1,
            videos: [
              {
                url: 'https://www.pexels.com/video/1',
                duration: 5,
                image: 'https://img.example/thumb.jpg',
                user: { name: 'Bob' },
                video_files: [
                  { quality: 'sd', file_type: 'video/mp4', link: 'https://video.example/sd.mp4' },
                  { quality: 'hd', file_type: 'video/mp4', link: 'https://video.example/hd.mp4' }
                ]
              }
            ]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    );

    const output = JSON.parse(await searchVideos('cat', 1, 'key')) as {
      results: Array<Record<string, string>>;
    };
    expect(output.results[0]).toMatchObject({
      url: 'https://video.example/hd.mp4',
      thumbnail: 'https://img.example/thumb.jpg',
      creator: 'Bob'
    });
  });
});
