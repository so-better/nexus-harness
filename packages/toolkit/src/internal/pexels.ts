/**
 * Pexels API 共享类型与请求。
 */

export interface MediaResult {
  title: string;
  url: string;
  thumbnail?: string;
  creator?: string;
  license?: string;
  source: string;
}

export interface PexelsPhotoResponse {
  total_results: number;
  photos: Array<{
    url: string;
    photographer: string;
    alt: string;
    src: { large: string; medium?: string };
  }>;
}

export interface PexelsVideoResponse {
  total_results: number;
  videos: Array<{
    url: string;
    duration: number;
    image: string;
    user: { name: string };
    video_files: Array<{
      quality: string;
      file_type: string;
      width: number;
      height: number;
      link: string;
    }>;
  }>;
}

export const requestPexels = async <T>(url: string, apiKey: string | undefined): Promise<T> => {
  if (!apiKey?.trim()) throw new Error('未配置 Pexels API Key');
  const response = await fetch(url, {
    headers: {
      authorization: apiKey.trim(),
      'user-agent': 'Nexus/0.1 (media search)'
    },
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`Pexels 返回 HTTP ${response.status}`);
  return (await response.json()) as T;
};

export const trimMediaOutput = (results: MediaResult[]): string => JSON.stringify({ results });
