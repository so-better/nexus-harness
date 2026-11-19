/**
 * search_videos：从 Pexels 搜索视频。
 */

import type { MediaResult, PexelsVideoResponse } from '../../internal/pexels';
import { requestPexels, trimMediaOutput } from '../../internal/pexels';

export const searchVideos = async (
  query: string,
  count: number,
  apiKey?: string
): Promise<string> => {
  const data = await requestPexels<PexelsVideoResponse>(
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${Math.min(10, Math.max(1, count))}`,
    apiKey
  );
  const results: MediaResult[] = (data.videos ?? [])
    .map((video): MediaResult | undefined => {
      const file =
        video.video_files.find((item) => item.quality === 'hd' && item.file_type === 'video/mp4') ??
        video.video_files.find((item) => item.file_type === 'video/mp4') ??
        video.video_files[0];
      if (!file) return undefined;
      return {
        title: video.user.name,
        url: file.link,
        thumbnail: video.image,
        creator: video.user.name,
        license: 'Pexels License',
        source: 'pexels'
      };
    })
    .filter((item): item is MediaResult => item !== undefined);
  if (results.length === 0) throw new Error('Pexels 没有返回视频');
  return trimMediaOutput(results);
};
