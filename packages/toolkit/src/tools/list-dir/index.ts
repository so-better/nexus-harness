/**
 * list_dir：列出授权目录。
 */

import { readdir } from 'node:fs/promises';
import { z } from 'zod';
import type { FileToolContext, FileToolDefinition, FileToolResult } from '../../internal';
import { resolveWithinRoots, validateInput } from '../../internal';

const MAX_LIST_ENTRIES = 500;
const inputSchema = z.object({ path: z.string().optional() });

export const listDirToolDefinition: FileToolDefinition = {
  name: 'list_dir',
  description: '列出授权目录内的文件与子目录。',
  permission: 'read',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: { path: { type: 'string', description: '目录路径，默认 primary root' } }
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
  const lines = entries
    .slice(0, MAX_LIST_ENTRIES)
    .map((entry) => `${entry.isDirectory() ? 'dir' : 'file'} ${entry.name}`);
  if (entries.length > MAX_LIST_ENTRIES) lines.push('...[已截断]');
  return { ok: true, output: lines.join('\n') };
};
