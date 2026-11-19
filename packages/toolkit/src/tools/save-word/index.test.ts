/**
 * save_word 测试：Markdown 生成 DOCX。
 */

import { describe, expect, it } from 'vitest';
import { createWordBuffer } from './index';

describe('save_word', () => {
  it('creates a DOCX buffer from Markdown', async () => {
    const word = await createWordBuffer({
      title: 'Title',
      content: '# Heading\n\n**bold** and `code`\n\n- item',
      platform: 'mac'
    });
    expect(word.subarray(0, 2).toString()).toBe('PK');
  });
});
