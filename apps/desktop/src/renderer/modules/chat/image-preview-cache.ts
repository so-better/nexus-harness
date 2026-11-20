/**
 * 图片预览短期缓存：避免同一条历史列表反复通过 IPC 读取同一张图。
 */
interface ImagePreview {
  mime: string;
  base64: string;
}

interface CacheEntry {
  expiresAt: number;
  value: Promise<ImagePreview>;
}

const MAX_ENTRIES = 8;
const TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

/**
 * 读取图片预览；相同 key 的并发请求复用同一个 Promise。
 */
export const getImagePreview = (
  key: string,
  loader: () => Promise<ImagePreview>
): Promise<ImagePreview> => {
  const existing = cache.get(key);
  if (existing && existing.expiresAt > Date.now()) return existing.value;
  const value = loader().catch((error: unknown) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, { expiresAt: Date.now() + TTL_MS, value });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return value;
};
