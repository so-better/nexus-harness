/**
 * glob：按模式查找授权目录内文件。
 */

import { isAbsolute, resolve } from 'node:path';
import { z } from 'zod';
import type { FileToolContext, FileToolDefinition, FileToolResult } from '../../internal';
import { validateInput } from '../../internal';
import { MAX_SEARCH_RESULTS, globToRegExp, resolveSearchRoot, walkFiles } from '../../internal';

const inputSchema = z.object({
  pattern: z.string().min(1).max(500),
  path: z.string().optional()
});

export const globToolDefinition: FileToolDefinition = {
  name: 'glob',
  description: '按 glob 模式查找授权目录内文件，返回相对路径。',
  permission: 'read',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: '例如 **/*.ts' },
      path: { type: 'string', description: '搜索起点，默认为 root' }
    },
    required: ['pattern']
  }
};

export const runGlobTool = async (
  { roots, primaryRoot }: FileToolContext,
  input: unknown
): Promise<FileToolResult> => {
  const parsed = validateInput(inputSchema, input);
  const target = isAbsolute(parsed.path ?? '.')
    ? (parsed.path ?? '.')
    : resolve(primaryRoot, parsed.path ?? '.');
  const base = await resolveSearchRoot(roots, target);
  const matcher = globToRegExp(parsed.pattern);
  const matches: string[] = [];
  await walkFiles(base, base, (_path, relativePath) => {
    if (matcher.test(relativePath)) matches.push(relativePath);
    return matches.length >= MAX_SEARCH_RESULTS;
  });
  return {
    ok: true,
    output: matches.join('\n'),
    ...(matches.length === 0 ? { error: { code: 'NO_MATCHES', message: '没有匹配的文件' } } : {})
  };
};
