/**
 * Markdown 排版契约：标题字号、块间距、行高与消息列表间距。
 */
import { describe, expect, it } from 'vitest';
import markdown from './MarkdownContent.vue?raw';
import message from '../components/ChatMessageItem.vue?raw';
import media from '../components/InlineMediaFile.less?raw';

describe('markdown layout contract', () => {

  it('uses the requested heading scale and spacing', () => {
    expect(markdown).toMatch(/\.nh-markdown \{[\s\S]*?line-height: 1\.5;/);
    expect(markdown).toContain('font-size: 28px;');
    expect(markdown).toContain('font-size: 24px;');
    expect(markdown).toContain('font-size: 20px;');
    expect(markdown).toContain('font-size: 18px;');
    expect(markdown).toContain('font-size: 16px;');
    expect(markdown).toContain('font-size: 14px;');
    expect(markdown).toMatch(/\.nh-markdown h1,[\s\S]*?margin: 0 0 15px;/);
    expect(markdown).toContain('.nh-markdown li {\n  margin: 0 0 4px;');
    expect(markdown).toContain('.nh-markdown p {\n  margin: 0 0 15px;');
    expect(markdown).toContain('.nh-markdown blockquote {\n  margin: 0 0 15px;');
    expect(markdown).toMatch(/\.nh-markdown table \{[\s\S]*?margin: 0 0 15px;/);
  });

  it('uses the same 15px block gap for message files and flow', () => {
    expect(message).toMatch(/\.nh-message__files \{[\s\S]*?gap: 15px;/);
    expect(message).toMatch(/\.nh-message__flow \{[\s\S]*?gap: 15px;/);
    expect(media).not.toContain('margin-bottom: 8px');
  });
});
