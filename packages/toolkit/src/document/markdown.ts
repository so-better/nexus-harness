/**
 * Markdown 解析：把正文转换为行内片段与块级元素。
 */

import MarkdownIt from 'markdown-it';
import type { Block, InlineToken } from './types';

const md = new MarkdownIt({ html: false, linkify: false, breaks: false });

interface MarkdownToken {
  type: string;
  content?: string;
  tag?: string;
  info?: string;
  attrGet?: (name: string) => string | null;
  children?: MarkdownToken[];
}

/** 展平 markdown-it 的行内 token（维护样式栈） */
const flattenInline = (children: MarkdownToken[]): InlineToken[] => {
  const out: InlineToken[] = [];
  const style: { bold?: boolean; italics?: boolean; link?: string } = {};

  for (const token of children) {
    switch (token.type) {
      case 'text':
      case 'html_inline':
        if (token.content) out.push({ text: token.content, ...style });
        break;
      case 'strong_open':
        style.bold = true;
        break;
      case 'strong_close':
        delete style.bold;
        break;
      case 'em_open':
        style.italics = true;
        break;
      case 'em_close':
        delete style.italics;
        break;
      case 'link_open': {
        const href = token.attrGet?.('href');
        if (href) style.link = href;
        else delete style.link;
        break;
      }
      case 'link_close':
        delete style.link;
        break;
      case 'code_inline':
        out.push({ text: token.content ?? '', ...style, code: true });
        break;
      case 'softbreak':
      case 'hardbreak':
        out.push({ text: '\n', ...style });
        break;
      case 'image':
        // 图片降级为链接（Word 不内嵌远程图片）
        {
          const src = token.attrGet?.('src');
          out.push({
            text: token.content || src || '',
            ...style,
            ...(src ? { link: src } : {})
          });
        }
        break;
      default:
        if (token.content) out.push({ text: token.content, ...style });
    }
  }

  return out;
};

/** 解析行内语法（加粗 / 斜体 / 行内代码 / 链接 / 图片降级） */
export const parseInline = (text: string): InlineToken[] => {
  if (!text) return [];
  const tokens = md.parseInline(text, {});
  const inline = tokens.find((token) => token.type === 'inline');
  const result = flattenInline((inline?.children ?? []) as MarkdownToken[]).filter(
    (token) => token.text !== ''
  );
  return result.length ? result : [{ text }];
};

/** 解析 Markdown 为块级元素数组 */
export const parseMarkdownBlocks = (markdown: string): Block[] => {
  if (!markdown?.trim()) return [];

  const tokens = md.parse(markdown, {}) as unknown as MarkdownToken[];
  const blocks: Block[] = [];

  const findMatchingClose = (start: number, openType: string, closeType: string) => {
    let depth = 0;
    for (let j = start; j < tokens.length; j++) {
      const token = tokens[j];
      if (!token) break;
      if (token.type === openType) depth++;
      else if (token.type === closeType) {
        depth--;
        if (depth === 0) return j;
      }
    }
    return tokens.length - 1;
  };

  const findListClose = (start: number) => {
    let depth = 0;
    for (let j = start; j < tokens.length; j++) {
      const type = tokens[j]?.type;
      if (type === 'bullet_list_open' || type === 'ordered_list_open') depth++;
      else if (type === 'bullet_list_close' || type === 'ordered_list_close') {
        depth--;
        if (depth === 0) return j;
      }
    }
    return tokens.length - 1;
  };

  const parseRange = (start: number, end: number, target: Block[]) => {
    let i = start;
    while (i < end) {
      const token = tokens[i];
      if (!token) {
        i += 1;
        continue;
      }

      if (token.type === 'heading_open') {
        target.push({
          type: 'heading',
          level: Number(token.tag?.slice(1) ?? '1'),
          text: tokens[i + 1]?.content ?? ''
        });
        i = findMatchingClose(i, 'heading_open', 'heading_close') + 1;
      } else if (token.type === 'paragraph_open') {
        target.push({ type: 'paragraph', text: tokens[i + 1]?.content ?? '' });
        i = findMatchingClose(i, 'paragraph_open', 'paragraph_close') + 1;
      } else if (token.type === 'fence') {
        target.push({
          type: 'code',
          lang: (token.info || '').trim().split(/\s+/)[0] || '',
          text: (token.content ?? '').replace(/\n$/, '')
        });
        i++;
      } else if (token.type === 'hr') {
        target.push({ type: 'hr' });
        i++;
      } else if (token.type === 'blockquote_open') {
        const close = findMatchingClose(i, 'blockquote_open', 'blockquote_close');
        const inner: Block[] = [];
        parseRange(i + 1, close, inner);
        const text = inner
          .map((block) => ('text' in block ? block.text : ''))
          .filter(Boolean)
          .join('\n');
        target.push({ type: 'quote', text });
        i = close + 1;
      } else if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
        const ordered = token.type === 'ordered_list_open';
        const close = findListClose(i);
        const items: string[] = [];
        const nested: Block[] = [];
        let j = i + 1;
        while (j < close) {
          if (tokens[j]?.type !== 'list_item_open') {
            j++;
            continue;
          }
          const itemClose = findMatchingClose(j, 'list_item_open', 'list_item_close');
          const itemBlocks: Block[] = [];
          parseRange(j + 1, itemClose, itemBlocks);
          const first = itemBlocks.shift();
          items.push(first && 'text' in first ? first.text : '');
          nested.push(...itemBlocks);
          j = itemClose + 1;
        }
        target.push({ type: 'list', ordered, items });
        target.push(...nested);
        i = close + 1;
      } else if (token.type === 'table_open') {
        const close = findMatchingClose(i, 'table_open', 'table_close');
        const rows: string[][] = [];
        let row: string[] | null = null;
        for (let j = i + 1; j < close; j++) {
          const current = tokens[j];
          if (!current) continue;
          if (current.type === 'tr_open') row = [];
          else if (current.type === 'tr_close') {
            if (row) rows.push(row);
            row = null;
          } else if (current.type === 'inline' && row) {
            row.push(current.content ?? '');
          }
        }
        target.push({ type: 'table', rows });
        i = close + 1;
      } else {
        i++;
      }
    }
  };

  parseRange(0, tokens.length, blocks);
  return blocks.filter((block) => block.type !== 'list' || block.items.length > 0);
};

// ═══════════════════════ Word / Excel 生成 ═══════════════════════
