/**
 * write_file：写入授权目录内文本文件。
 */

import { writeFile } from 'node:fs/promises';
import { z } from 'zod';
import type { FileToolContext, FileToolDefinition, FileToolResult } from '../../internal';
import { resolveForWrite, validateInput } from '../../internal';

const inputSchema = z.object({
  path: z.string().min(1).max(4096),
  content: z.string().max(800_000),
  createDirs: z.boolean().optional()
});

export const writeFileToolDefinition: FileToolDefinition = {
  name: 'write_file',
  description: '写入授权目录内的文本文件；写前需要用户审批。',
  permission: 'write',
  requiresApproval: true,
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      content: { type: 'string' },
      createDirs: { type: 'boolean' }
    },
    required: ['path', 'content']
  }
};

export const runWriteFileTool = async (
  { roots, primaryRoot }: FileToolContext,
  input: unknown
): Promise<FileToolResult> => {
  const parsed = validateInput(inputSchema, input);
  const target = await resolveForWrite(roots, primaryRoot, parsed.path, parsed.createDirs ?? false);
  await writeFile(target, parsed.content, 'utf8');
  return {
    ok: true,
    output: `已写入 ${parsed.path}（${Buffer.byteLength(parsed.content, 'utf8')} bytes）`
  };
};
