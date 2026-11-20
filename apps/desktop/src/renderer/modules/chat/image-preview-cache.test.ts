// @vitest-environment jsdom
/**
 * 图片预览缓存：并发读取复用同一个请求。
 */
import { describe, expect, it, vi } from 'vitest';
import { getImagePreview } from './image-preview-cache';

describe('getImagePreview', () => {
  it('deduplicates concurrent loads for the same key', async () => {
    const loader = vi.fn().mockResolvedValue({ mime: 'image/png', base64: 'preview' });
    const [first, second] = await Promise.all([
      getImagePreview('test:shared', loader),
      getImagePreview('test:shared', loader)
    ]);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ mime: 'image/png', base64: 'preview' });
    expect(second).toEqual(first);
  });
});
