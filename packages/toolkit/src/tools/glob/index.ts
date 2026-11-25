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
  path: z.string().optional(),
  offset: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().max(MAX_SEARCH_RESULTS).optional()
});

export const globToolDefinition: FileToolDefinition = {
  name: 'glob',
  description: '按 glob 模式查找授权目录内文件，返回相对路径；结果过多时用 offset 继续。',
  permission: 'read',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: '例如 **/*.ts' },
      path: { type: 'string', description: '搜索起点，默认为 root' },
      offset: { type: 'number', description: '跳过前若干个结果，默认 0' },
      limit: { type: 'number', description: '本次最多返回的结果数' }
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
  const offset = parsed.offset ?? 0;
  const limit = parsed.limit ?? MAX_SEARCH_RESULTS;
  const matches: string[] = [];
  let matched = 0;
  let capped = false;
  await walkFiles(base, base, (_path, relativePath) => {
    if (!matcher.test(relativePath)) return false;
    matched += 1;
    if (matched <= offset) return false;
    if (matches.length >= limit) {
      capped = true;
      return true;
    }
    matches.push(relativePath);
    return false;
  });
  if (matched === 0) {
    return { ok: true, output: '', error: { code: 'NO_MATCHES', message: '没有匹配的文件' } };
  }
  const more = capped || matched > offset + matches.length;
  const output = matches.join('\n');
  return {
    ok: true,
    output: more
      ? `${output}${output ? '\n' : ''}...[还有更多文件，可用 offset=${offset + matches.length} 继续]`
      : output
  };
};
