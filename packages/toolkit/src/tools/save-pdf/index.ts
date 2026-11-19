/**
 * PDF 生成：Markdown 渲染、中文字体、分页与页码。
 */

import PDFDocument from 'pdfkit';
import { PDF_FONT_BOLD, PDF_FONT_REGULAR } from '../../document/fonts';

const isSafeLink = (href: string): boolean => /^(https?:|mailto:)/i.test(href.trim());

const displayWidth = (value: string): number =>
  Array.from(value).reduce((width, char) => width + (char.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
import { parseInline, parseMarkdownBlocks } from '../../document/markdown';

/** 生成 pdf 文件内容（基于 pdfkit，内嵌 Noto Sans SC 中文字体） */
const buildPdf = async (markdown: string, title?: string) => {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 56, bottom: 64, left: 56, right: 56 },
    bufferPages: true
  });
  doc.registerFont('regular', PDF_FONT_REGULAR);
  doc.registerFont('bold', PDF_FONT_BOLD);
  doc.font('regular');

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve) =>
    doc.on('end', () => resolve(Buffer.concat(chunks)))
  );

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const contentWidth = right - left;
  const pageBottom = () => doc.page.height - doc.page.margins.bottom;
  const textColor = '#1F2937';
  const muted = '#6B7280';
  const accent = '#00AEEF';

  const ensureSpace = (height: number) => {
    if (doc.y + height > pageBottom()) doc.addPage();
  };

  /** 渲染带行内样式的文本（加粗 / 行内代码 / 链接） */
  const renderInline = (text: string, indent = 0) => {
    const tokens = parseInline(text);
    if (!tokens.length) return;
    const width = contentWidth - indent;
    tokens.forEach((token, index) => {
      const continued = index < tokens.length - 1;
      // 仅 http(s)/mailto 链接可点击，避免 javascript:/file:/data: 进入 PDF 注释
      const link = token.link && isSafeLink(token.link) ? token.link : undefined;
      if (link) doc.font('regular').fontSize(11).fillColor('#0563C1');
      else if (token.bold) doc.font('bold').fontSize(11).fillColor(textColor);
      else if (token.code) doc.font('regular').fontSize(10.5).fillColor('#E11D48');
      else doc.font('regular').fontSize(11).fillColor(textColor);

      if (index === 0) {
        doc.text(token.text, left + indent, doc.y, { width, continued, link, underline: !!link });
      } else {
        doc.text(token.text, { continued, link, underline: !!link });
      }
    });
    doc.x = left;
  };

  /** 渲染表格（手动绘制网格，行级分页） */
  const renderTable = (rows: string[][]) => {
    if (!rows.length) return;
    const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
    if (!columnCount) return;
    const weights = Array.from({ length: columnCount }, (_, c) => {
      let max = 4;
      for (const row of rows) max = Math.max(max, displayWidth(row[c] ?? ''));
      return Math.min(max, 40);
    });
    const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
    const widths = weights.map((weight) => (contentWidth * weight) / total);
    const padding = 6;
    const fontSize = 10;

    const rowHeights = rows.map((row, r) => {
      let height = 0;
      for (let c = 0; c < columnCount; c++) {
        doc.font(r === 0 ? 'bold' : 'regular').fontSize(fontSize);
        height = Math.max(
          height,
          doc.heightOfString(row[c] ?? '', {
            width: Math.max((widths[c] ?? 0) - padding * 2, 4)
          })
        );
      }
      return height + padding * 2;
    });

    rows.forEach((row, r) => {
      const rowHeight = rowHeights[r] ?? 0;
      if (doc.y + rowHeight > pageBottom()) doc.addPage();
      let x = left;
      const y = doc.y;
      for (let c = 0; c < columnCount; c++) {
        const width = widths[c] ?? 0;
        if (r === 0) doc.save().rect(x, y, width, rowHeight).fill(accent).restore();
        doc
          .save()
          .rect(x, y, width, rowHeight)
          .strokeColor('#E5E7EB')
          .lineWidth(0.5)
          .stroke()
          .restore();
        doc
          .font(r === 0 ? 'bold' : 'regular')
          .fontSize(fontSize)
          .fillColor(r === 0 ? '#FFFFFF' : textColor);
        doc.text(row[c] ?? '', x + padding, y + padding, {
          width: Math.max(width - padding * 2, 4)
        });
        x += width;
      }
      doc.y = y + rowHeight;
    });
    doc.moveDown(0.6);
  };

  if (title?.trim()) {
    doc.font('bold').fontSize(22).fillColor(textColor).text(title.trim(), { width: contentWidth });
    doc.moveDown(0.5);
  }

  for (const block of parseMarkdownBlocks(markdown)) {
    if (block.type === 'heading') {
      const sizes = [20, 17, 15, 13, 12, 12];
      const size = sizes[block.level - 1] ?? 12;
      ensureSpace(size + 14);
      doc
        .font('bold')
        .fontSize(size)
        .fillColor(textColor)
        .text(
          parseInline(block.text)
            .map((token) => token.text)
            .join(''),
          { width: contentWidth }
        );
      doc.moveDown(0.35);
    } else if (block.type === 'paragraph') {
      renderInline(block.text);
      doc.moveDown(0.5);
    } else if (block.type === 'list') {
      block.items.forEach((item, index) =>
        renderInline(`${block.ordered ? `${index + 1}. ` : '• '}${item}`, 12)
      );
      doc.moveDown(0.4);
    } else if (block.type === 'quote') {
      doc.font('regular').fontSize(11);
      const height = doc.heightOfString(block.text, { width: contentWidth - 16 });
      ensureSpace(height + 8);
      const y = doc.y;
      doc.save().rect(left, y, 3, height).fill(accent).restore();
      doc.fillColor(muted).text(block.text, left + 16, y, { width: contentWidth - 16 });
      doc.moveDown(0.5);
    } else if (block.type === 'code') {
      doc.font('regular').fontSize(9);
      const height = doc.heightOfString(block.text, { width: contentWidth - 16, lineGap: 2 });
      ensureSpace(height + 12);
      const y = doc.y;
      doc
        .save()
        .rect(left, y - 4, contentWidth, height + 12)
        .fill('#F5F5F5')
        .restore();
      doc
        .fillColor('#374151')
        .text(block.text, left + 8, y + 2, { width: contentWidth - 16, lineGap: 2 });
      doc.moveDown(0.6);
    } else if (block.type === 'table') {
      renderTable(block.rows);
    } else if (block.type === 'hr') {
      ensureSpace(14);
      doc.moveDown(0.3);
      doc
        .save()
        .moveTo(left, doc.y)
        .lineTo(right, doc.y)
        .strokeColor('#E5E7EB')
        .lineWidth(0.5)
        .stroke()
        .restore();
      doc.moveDown(0.5);
    }
  }

  // 页码
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font('regular').fontSize(9).fillColor(muted);
    doc.text(String(i - range.start + 1), left, doc.page.height - 44, {
      width: contentWidth,
      align: 'right',
      lineBreak: false
    });
  }

  doc.end();
  return await finished;
};

/**
 * 二进制办公文档生成工具（用户侧）
 *
 * 模型提供结构化内容（Markdown / 表格数据），服务端用 docx / exceljs 渲染成
 * .docx / .xlsx 并落盘到 files/ai，返回下载链接。
 */

/**
 * 生成 PDF 文档。
 */
export const createPdfBuffer = async (markdown: string, title?: string): Promise<Buffer> =>
  buildPdf(markdown, title);
