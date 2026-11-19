/**
 * AI 回复分段：echarts / mermaid / iframe 代码块独立渲染，其余走 Markdown。
 */

export type Segment =
  | { type: 'md'; content: string }
  | { type: 'echarts'; option: Record<string, unknown> }
  | { type: 'mermaid'; code: string }
  | { type: 'iframe'; code: string };

/**
 * 流式过程中不完整或非法 JSON 会静默跳过，等待后续内容补齐。
 */
export const parseSegments = (content: string): Segment[] => {
  const blockReg = /`{3,}\s*(echarts|mermaid|iframe)\s*\n([\s\S]*?)`{3,}/g;
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  blockReg.lastIndex = 0;

  while ((match = blockReg.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const mdContent = content.slice(lastIndex, match.index).replace(/`+\s*$/g, '');
      if (mdContent.trim()) segments.push({ type: 'md', content: mdContent });
    }
    const lang = match[1];
    const code = match[2]?.trim() ?? '';
    if (lang === 'echarts') {
      try {
        segments.push({ type: 'echarts', option: JSON.parse(code) as Record<string, unknown> });
      } catch {
        // 等待流式内容补齐
      }
    } else if (lang === 'mermaid') {
      segments.push({ type: 'mermaid', code });
    } else if (lang === 'iframe') {
      segments.push({ type: 'iframe', code });
    }
    lastIndex = blockReg.lastIndex;
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'md', content: content.slice(lastIndex) });
  }
  return segments;
};
