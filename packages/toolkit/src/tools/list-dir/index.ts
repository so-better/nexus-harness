/**
 * list_dir：列出授权目录。
 */

import { readdir } from 'node:fs/promises';
import { z } from 'zod';
import type { FileToolContext, FileToolDefinition, FileToolResult } from '../../internal';
import { resolveWithinRoots, validateInput } from '../../internal';

const MAX_LIST_ENTRIES = 200;
const inputSchema = z.object({
  path: z.string().optional(),
  offset: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().max(MAX_LIST_ENTRIES).optional()
});

export const listDirToolDefinition: FileToolDefinition = {
  name: 'list_dir',
  description: '列出授权目录内的文件与子目录；条目过多时用 offset 继续。',
  permission: 'read',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '目录路径，默认 primary root' },
      offset: { type: 'number', description: '跳过前若干个条目，默认 0' },
      limit: { type: 'number', description: '本次最多返回的条目数' }
    }
  }
};

export const runListDirTool = async (
  { roots, primaryRoot }: FileToolContext,
  input: unknown
): Promise<FileToolResult> => {
  const parsed = validateInput(inputSchema, input);
  const target = await resolveWithinRoots(roots, primaryRoot, parsed.path ?? '.');
  const entries = await readdir(target, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const offset = parsed.offset ?? 0;
  const limit = parsed.limit ?? MAX_LIST_ENTRIES;
  const end = offset + limit;
  const lines = entries
    .slice(offset, end)
    .map((entry) => `${entry.isDirectory() ? 'dir' : 'file'} ${entry.name}`);
  if (entries.length > end) lines.push(`...[已截断，可用 offset=${end} 继续]`);
  return { ok: true, output: lines.join('\n') };
};
