/**
 * 知识库切分：段落合并、标题保留与超长文本切分。
 */
import { describe, expect, it } from 'vitest';
import { chunkKnowledgeText } from './chunk-text';

describe('chunkKnowledgeText', () => {
  it('keeps short paragraphs together and preserves the heading', () => {
    const chunks = chunkKnowledgeText(
      '# 退款政策\n\n申请后三个工作日到账。\n\n超过时间请联系客服。'
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.heading).toBe('退款政策');
    expect(chunks[0]?.content).toContain('超过时间请联系客服');
  });

  it('splits long blocks into bounded chunks', () => {
    const chunks = chunkKnowledgeText('内容'.repeat(2_000));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.content.length <= 1_200)).toBe(true);
  });
});
