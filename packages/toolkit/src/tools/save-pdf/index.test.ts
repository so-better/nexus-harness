/**
 * save_pdf 测试：Markdown 与中文字体生成 PDF。
 */

import { describe, expect, it } from 'vitest';
import { createPdfBuffer } from './index';

describe('save_pdf', () => {
  it('creates a PDF buffer from Markdown', async () => {
    const pdf = await createPdfBuffer('# 中文标题\n\n中文正文 **加粗**', '中文文档');
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });
});
