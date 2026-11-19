/**
 * search_images：从 Pexels 搜索图片。
 */

import type { MediaResult, PexelsPhotoResponse } from '../../internal/pexels';
import { requestPexels, trimMediaOutput } from '../../internal/pexels';

export const searchImages = async (
  query: string,
  count: number,
  apiKey?: string
): Promise<string> => {
  const data = await requestPexels<PexelsPhotoResponse>(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${Math.min(10, Math.max(1, count))}`,
    apiKey
  );
  const results: MediaResult[] = (data.photos ?? []).map((photo) => ({
    title: photo.alt,
    url: photo.src.large,
    ...(photo.src.medium ? { thumbnail: photo.src.medium } : {}),
    ...(photo.photographer ? { creator: photo.photographer } : {}),
    license: 'Pexels License',
    source: 'pexels'
  }));
  if (results.length === 0) throw new Error('Pexels 没有返回图片');
  return trimMediaOutput(results);
};
