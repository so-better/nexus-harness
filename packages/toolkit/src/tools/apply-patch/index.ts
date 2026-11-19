/**
 * apply_patch：替换授权文件中的唯一文本。
 */

import { readFile, stat, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import type { FileToolContext, FileToolDefinition, FileToolResult } from '../../internal';
import { FileToolError, resolveWithinRoots, validateInput } from '../../internal';

const MAX_PATCH_FILE_BYTES = 10 * 1024 * 1024;
const inputSchema = z.object({
  path: z.string().min(1).max(4096),
  oldText: z.string().min(1).max(800_000),
  newText: z.string().max(800_000)
});

export const applyPatchToolDefinition: FileToolDefinition = {
  name: 'apply_patch',
  description: '在授权文件内替换唯一匹配的文本；写前需要用户审批。',
  permission: 'write',
  requiresApproval: true,
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      oldText: { type: 'string' },
      newText: { type: 'string' }
    },
    required: ['path', 'oldText', 'newText']
  }
};

export const runApplyPatchTool = async (
  { roots, primaryRoot }: FileToolContext,
  input: unknown
): Promise<FileToolResult> => {
  const parsed = validateInput(inputSchema, input);
  const target = await resolveWithinRoots(roots, primaryRoot, parsed.path);
  const info = await stat(target);
  if (info.size > MAX_PATCH_FILE_BYTES) {
    throw new FileToolError('FILE_TOO_LARGE', '待修改文件超过大小上限');
  }
  const content = await readFile(target, 'utf8');
  const occurrences = content.split(parsed.oldText).length - 1;
  if (occurrences !== 1) {
    throw new FileToolError(
      'PATCH_TARGET_INVALID',
      `待替换文本出现 ${occurrences} 次，必须恰好 1 次`
    );
  }
  await writeFile(target, content.replace(parsed.oldText, parsed.newText), 'utf8');
  return { ok: true, output: `已更新 ${parsed.path}` };
};
