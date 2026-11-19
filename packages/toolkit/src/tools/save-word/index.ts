/**
 * Word 生成：Markdown 渲染为 docx。
 */

import {
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  AlignmentType,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType
} from 'docx';
import { resolveFonts } from '../../document/fonts';
import { parseInline, parseMarkdownBlocks } from '../../document/markdown';
import type { Block, OfficeFonts, WordDocumentInput } from '../../document/types';

const WORD_HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6
];

/** 仅允许安全协议的链接，其余（javascript:/data:/file: 等）降级为纯文本 */
const isSafeLink = (href: string) => /^(https?:|mailto:)/i.test((href || '').trim());

/** 行内 Markdown → docx TextRun / 超链接 */
const inlineToRuns = (
  text: string,
  mono: string,
  forceBold = false
): (TextRun | ExternalHyperlink)[] =>
  parseInline(text).map((token) => {
    if (token.link && isSafeLink(token.link)) {
      return new ExternalHyperlink({
        link: token.link,
        children: [
          new TextRun({
            text: token.text,
            color: '0563C1',
            underline: { type: UnderlineType.SINGLE }
          })
        ]
      });
    }
    return new TextRun({
      text: token.text,
      ...(forceBold || token.bold ? { bold: true } : {}),
      ...(token.italics ? { italics: true } : {}),
      ...(token.code ? { font: mono } : {})
    });
  });

/** 代码块 → 逐行 TextRun（用 break 换行） */
const codeToRuns = (code: string, mono: string): TextRun[] =>
  code.split('\n').map(
    (line, index) =>
      new TextRun({
        text: line,
        font: mono,
        size: 20,
        ...(index === 0 ? {} : { break: 1 })
      })
  );

/** A4 内容区宽度（缇）：A4 宽 11906 − 左右页边距各 1440 */
const TABLE_CONTENT_WIDTH = 9026;

/** 估算文本显示宽度：中日韩字符按 2 计 */
const displayWidth = (value: string) =>
  Array.from(value).reduce((width, char) => width + (char.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);

/** 按各列内容长度按比例分配列宽，避免 docx 默认的 100 缇极窄列 */
const computeColumnWidths = (rows: string[][]): number[] => {
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (!columnCount) return [];

  const weights = Array.from({ length: columnCount }, (_, c) => {
    let max = 4;
    for (const row of rows) max = Math.max(max, displayWidth(row[c] ?? ''));
    return Math.min(max, 40);
  });

  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const minWidth = Math.min(600, Math.floor(TABLE_CONTENT_WIDTH / columnCount));
  const widths = weights.map((weight) =>
    Math.max(minWidth, Math.round((TABLE_CONTENT_WIDTH * weight) / total))
  );

  // 归一化，使各列宽之和正好等于内容区宽度
  const sum = widths.reduce((acc, width) => acc + width, 0);
  const lastWidth = widths[columnCount - 1] ?? minWidth;
  widths[columnCount - 1] = Math.max(minWidth, lastWidth + (TABLE_CONTENT_WIDTH - sum));
  return widths;
};

/** Markdown 表格 → docx Table */
const tableToDocx = (rows: string[][], mono: string): Table => {
  const columnWidths = computeColumnWidths(rows);
  return new Table({
    width: { size: TABLE_CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths,
    rows: rows.map(
      (cells, rowIndex) =>
        new TableRow({
          tableHeader: rowIndex === 0,
          children: cells.map(
            (cell, columnIndex) =>
              new TableCell({
                ...(columnWidths[columnIndex]
                  ? { width: { size: columnWidths[columnIndex], type: WidthType.DXA } }
                  : {}),
                children: [new Paragraph({ children: inlineToRuns(cell, mono, rowIndex === 0) })]
              })
          )
        })
    )
  });
};

/** 块级 Markdown → docx 子节点 */
const blocksToDocx = (blocks: Block[], mono: string): (Paragraph | Table)[] => {
  const children: (Paragraph | Table)[] = [];
  // 有序列表各自独立编号（instance 不同即重新从 1 开始），否则多个有序列表会连续编号
  let orderedInstance = 0;

  for (const block of blocks) {
    if (block.type === 'heading') {
      children.push(
        new Paragraph({
          heading: WORD_HEADINGS[block.level - 1] ?? HeadingLevel.HEADING_6,
          children: inlineToRuns(block.text, mono)
        })
      );
    } else if (block.type === 'paragraph') {
      children.push(
        new Paragraph({ children: inlineToRuns(block.text, mono), spacing: { after: 120 } })
      );
    } else if (block.type === 'list') {
      const instance = block.ordered ? ++orderedInstance : undefined;
      for (const item of block.items) {
        children.push(
          new Paragraph({
            children: inlineToRuns(item, mono),
            ...(block.ordered && instance !== undefined
              ? { numbering: { reference: 'ordered-list', level: 0, instance } }
              : { bullet: { level: 0 } })
          })
        );
      }
    } else if (block.type === 'quote') {
      children.push(
        new Paragraph({
          children: inlineToRuns(block.text.replace(/\n/g, ' '), mono),
          indent: { left: 360 },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'CCCCCC', space: 8 } }
        })
      );
    } else if (block.type === 'code') {
      children.push(
        new Paragraph({
          children: codeToRuns(block.text, mono),
          shading: { type: ShadingType.CLEAR, fill: 'F5F5F5' },
          spacing: { before: 80, after: 120 }
        })
      );
    } else if (block.type === 'hr') {
      children.push(
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC', space: 1 } }
        })
      );
    } else if (block.type === 'table') {
      children.push(tableToDocx(block.rows, mono));
    }
  }

  return children;
};

/** 生成 docx 文件内容 */
const buildDocx = async (markdown: string, title: string | undefined, fonts: OfficeFonts) => {
  const blocks = parseMarkdownBlocks(markdown);
  const children: (Paragraph | Table)[] = [];
  // Markdown 正文已有一级标题时，不再额外插入标题，避免出现两个大标题
  const hasH1 = blocks.some((block) => block.type === 'heading' && block.level === 1);
  if (title?.trim() && !hasH1) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: title.trim(), bold: true })]
      })
    );
  }
  children.push(...blocksToDocx(blocks, fonts.mono));

  const doc = new Document({
    // 中文友好默认字体与 1.5 倍行距
    styles: {
      default: {
        document: {
          run: {
            font: { ascii: fonts.latin, hAnsi: fonts.latin, eastAsia: fonts.cjk, hint: 'eastAsia' },
            size: 21
          },
          paragraph: { spacing: { line: 360, after: 120 } }
        }
      }
    },
    numbering: {
      config: [
        {
          reference: 'ordered-list',
          levels: [
            { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START }
          ]
        }
      ]
    },
    sections: [
      {
        properties: {
          // A4 纸张 + 标准页边距（单位：缇，1 英寸 = 1440）
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
          }
        },
        children
      }
    ]
  });
  return await Packer.toBuffer(doc);
};

/**
 * 生成 Word 文档；正文按 Markdown 解析。
 */
export const createWordBuffer = async (input: WordDocumentInput): Promise<Buffer> =>
  buildDocx(input.content, input.title, resolveFonts(input.platform));
