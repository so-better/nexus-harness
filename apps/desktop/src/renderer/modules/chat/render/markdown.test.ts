// @vitest-environment jsdom
/**
 * Markdown 媒体渲染：图片与视频由模型直接输出时，必须在前端保留并可展示。
 */

import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown media', () => {
  it('keeps image markdown', () => {
    const html = renderMarkdown('![封面](https://images.pexels.com/photo.jpeg)');
    expect(html).toContain('<img');
    expect(html).toContain('src="https://images.pexels.com/photo.jpeg"');
    expect(html).toContain('alt="封面"');
  });

  it('keeps video elements and controls', () => {
    const html = renderMarkdown(
      '<video controls preload="metadata" src="https://videos.pexels.com/demo.mp4"></video>'
    );
    expect(html).toContain('<video');
    expect(html).toContain('controls');
    expect(html).toContain('src="https://videos.pexels.com/demo.mp4"');
  });
});
