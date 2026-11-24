/**
 * 知识库切分：按标题和段落生成可控长度的 chunk，保留标题上下文。
 */

export interface KnowledgeTextChunk {
  ordinal: number;
  heading?: string;
  content: string;
}

const MAX_CHUNK_CHARS = 1_200;
const MIN_CHUNK_CHARS = 180;
const OVERLAP_CHARS = 120;

const normalize = (value: string): string => value.replace(/\r\n?/g, '\n').trim();

/**
 * 从段落开头识别 Markdown 标题，作为后续 chunk 的 heading。
 */
const headingFrom = (block: string): string | undefined => {
  const first = block.split('\n', 1)[0] ?? '';
  return /^#{1,6}\s+\S/.test(first) ? first.replace(/^#{1,6}\s+/, '').trim() : undefined;
};

/**
 * 在句子或换行边界切分超长段落；找不到边界时硬切。
 */
const splitLongBlock = (block: string): string[] => {
  const result: string[] = [];
  let start = 0;
  while (start < block.length) {
    let end = Math.min(start + MAX_CHUNK_CHARS, block.length);
    if (end < block.length) {
      const window = block.slice(start + MIN_CHUNK_CHARS, end);
      const boundary = Math.max(
        window.lastIndexOf('\n'),
        window.lastIndexOf('。'),
        window.lastIndexOf('；'),
        window.lastIndexOf('！'),
        window.lastIndexOf('？'),
        window.lastIndexOf('. ')
      );
      if (boundary >= 0) end = start + MIN_CHUNK_CHARS + boundary + 1;
    }
    const content = block.slice(start, end).trim();
    if (content) result.push(content);
    if (end >= block.length) break;
    start = Math.max(1, end - OVERLAP_CHARS);
  }
  return result;
};

/**
 * 生成知识库 chunk；保留标题并尽量按段落合并。
 */
export const chunkKnowledgeText = (text: string): KnowledgeTextChunk[] => {
  const blocks = normalize(text)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const chunks: KnowledgeTextChunk[] = [];
  let heading: string | undefined;
  let current = '';

  const flush = (): void => {
    const content = current.trim();
    if (content) chunks.push({ ordinal: chunks.length, ...(heading ? { heading } : {}), content });
    current = '';
  };

  for (const block of blocks) {
    heading = headingFrom(block) ?? heading;
    if (block.length > MAX_CHUNK_CHARS) {
      flush();
      for (const part of splitLongBlock(block)) {
        chunks.push({
          ordinal: chunks.length,
          ...(heading ? { heading } : {}),
          content: part
        });
      }
      continue;
    }
    const next = current ? `${current}\n\n${block}` : block;
    if (next.length > MAX_CHUNK_CHARS) {
      flush();
      current = block;
    } else {
      current = next;
    }
  }
  flush();
  return chunks;
};
