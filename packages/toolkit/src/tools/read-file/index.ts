/**
 * read_file：读取授权目录内文本文件，二进制按类型抽取。
 */

import { open, stat } from 'node:fs/promises';
import { z } from 'zod';
import { readTextFileOrExtract } from './binary-reader';
import type { FileToolContext, FileToolDefinition, FileToolResult } from '../../internal';
import { FileToolError, resolveWithinRoots, validateInput } from '../../internal';

const DEFAULT_MAX_BYTES = 200_000;
const MAX_BINARY_READ_BYTES = 50_000_000;
const BINARY_EXTENSIONS =
  /\.(pdf|docx|xlsx|xls|pptx|zip|png|jpe?g|gif|webp|bmp|ico|mp3|mp4|wav|mov)$/i;
const inputSchema = z.object({
  path: z.string().min(1),
  offset: z.number().int().nonnegative().optional(),
  maxBytes: z.number().int().positive().max(1_000_000).optional()
});

export const readFileToolDefinition: FileToolDefinition = {
  name: 'read_file',
  description: '读取授权目录内的文本文件；超出上限时截断，可用 offset 继续读取后续内容。',
  permission: 'read',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '相对于 root 的路径或 root 内的绝对路径' },
      offset: { type: 'number', description: '从该字节偏移开始读取，默认 0' },
      maxBytes: { type: 'number', description: '本次最大读取字节数' }
    },
    required: ['path']
  }
};

export const runReadFileTool = async (
  { roots, primaryRoot }: FileToolContext,
  input: unknown
): Promise<FileToolResult> => {
  const parsed = validateInput(inputSchema, input);
  const target = await resolveWithinRoots(roots, primaryRoot, parsed.path);
  const info = await stat(target);
  if (info.isDirectory()) throw new FileToolError('IS_DIRECTORY', `目标是目录：${parsed.path}`);

  const maxBytes = parsed.maxBytes ?? DEFAULT_MAX_BYTES;
  if (BINARY_EXTENSIONS.test(target)) {
    // 抽取类文件按整个文本截断，分页语义不成立；明确拒绝而非静默忽略 offset
    if ((parsed.offset ?? 0) > 0) {
      throw new FileToolError('OFFSET_UNSUPPORTED', '二进制/抽取类文件暂不支持 offset 分页');
    }
    if (info.size > MAX_BINARY_READ_BYTES) {
      throw new FileToolError('FILE_TOO_LARGE', `文件超过 ${MAX_BINARY_READ_BYTES} 字节`);
    }
    const result = await readTextFileOrExtract(target, maxBytes);
    if (!result.output.trim()) {
      throw new FileToolError(
        'FILE_NO_TEXT',
        target.toLowerCase().endsWith('.pdf')
          ? `PDF 没有可提取的文本层：${parsed.path}`
          : `文件没有可读取的文本：${parsed.path}`
      );
    }
    return { ok: true, output: result.output };
  }

  // 文本文件从 offset 读取本次 maxBytes 范围，超出时提示剩余字节与续读方式
  const offset = parsed.offset ?? 0;
  if (info.size === 0) return { ok: true, output: '' };
  if (offset >= info.size) {
    throw new FileToolError('OFFSET_OUT_OF_RANGE', `偏移超出文件大小：${offset}/${info.size}`);
  }
  const remaining = info.size - offset;
  const toRead = Math.min(remaining, maxBytes);
  const handle = await open(target, 'r');
  try {
    const buffer = Buffer.alloc(toRead);
    const { bytesRead } =
      toRead > 0 ? await handle.read(buffer, 0, toRead, offset) : { bytesRead: 0 };
    const chunk = buffer.subarray(0, bytesRead);
    if (chunk.includes(0)) {
      throw new FileToolError('BINARY_FILE', `无法读取二进制文件：${parsed.path}`);
    }
    const text = chunk.toString('utf8');
    if (remaining > maxBytes) {
      const end = offset + bytesRead;
      return {
        ok: true,
        output: `${text}\n\n...[已截断，已读取字节 ${offset}-${end} / 共 ${info.size}；可用 offset=${end} 继续读取]`
      };
    }
    return { ok: true, output: text };
  } finally {
    await handle.close();
  }
};
