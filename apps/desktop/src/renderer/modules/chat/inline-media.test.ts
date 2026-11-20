/**
 * 内联媒体判定：图片/视频在 20MB 内直接展示，SVG 走文本预览。
 */
import { describe, expect, it } from 'vitest';
import type { OutputFile } from '@shared/ipc/contracts';
import { INLINE_MEDIA_MAX_BYTES, isInlineMediaFile } from './inline-media';

const file = (mime: string, bytes: number): OutputFile => ({
  id: 'file-1',
  sessionId: 'session-1',
  name: 'media',
  mime,
  bytes,
  source: 'generated',
  createdAt: 0
});

describe('isInlineMediaFile', () => {
  it('accepts images and videos within the limit', () => {
    expect(isInlineMediaFile(file('image/png', 1024))).toBe(true);
    expect(isInlineMediaFile(file('video/mp4', INLINE_MEDIA_MAX_BYTES))).toBe(true);
  });

  it('rejects svg, oversized media and non-media files', () => {
    expect(isInlineMediaFile(file('image/svg+xml', 1024))).toBe(false);
    expect(isInlineMediaFile(file('image/png', INLINE_MEDIA_MAX_BYTES + 1))).toBe(false);
    expect(isInlineMediaFile(file('application/pdf', 1024))).toBe(false);
  });
});
