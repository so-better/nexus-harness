/**
 * read_file：读取授权目录内文本文件，二进制按类型抽取。
 */

import { open, readFile, stat } from 'node:fs/promises';
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
  maxBytes: z.number().int().positive().max(1_000_000).optional()
});

export const readFileToolDefinition: FileToolDefinition = {
  name: 'read_file',
  description: '读取授权目录内的文本文件，超出大小上限时截断。',
  permission: 'read',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '相对于 root 的路径或 root 内的绝对路径' },
      maxBytes: { type: 'number', description: '最大读取字节数' }
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

  if (info.size > maxBytes) {
    const handle = await open(target, 'r');
    try {
      const buffer = Buffer.alloc(maxBytes);
      const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
      const chunk = buffer.subarray(0, bytesRead);
      if (chunk.includes(0)) {
        throw new FileToolError('BINARY_FILE', `无法读取二进制文件：${parsed.path}`);
      }
      return { ok: true, output: `${chunk.toString('utf8')}\n\n...[已截断]` };
    } finally {
      await handle.close();
    }
  }

  const buffer = await readFile(target);
  if (buffer.includes(0)) {
    throw new FileToolError('BINARY_FILE', `无法读取二进制文件：${parsed.path}`);
  }
  return { ok: true, output: buffer.toString('utf8') };
};
