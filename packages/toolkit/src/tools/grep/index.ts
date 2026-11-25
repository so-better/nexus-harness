/**
 * grep：在授权目录内搜索文本。
 */

import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { z } from 'zod';
import type { FileToolContext, FileToolDefinition, FileToolResult } from '../../internal';
import { validateInput } from '../../internal';
import {
  MAX_GREP_FILE_BYTES,
  MAX_GREP_OUTPUT_BYTES,
  MAX_SEARCH_RESULTS,
  globToRegExp,
  resolveSearchRoot,
  walkFiles
} from '../../internal';

const inputSchema = z.object({
  pattern: z.string().min(1).max(2_000),
  path: z.string().optional(),
  glob: z.string().min(1).max(500).optional(),
  offset: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().max(MAX_SEARCH_RESULTS).optional()
});

export const grepToolDefinition: FileToolDefinition = {
  name: 'grep',
  description: '在授权目录内搜索文本内容，返回路径、行号与匹配行；结果过多时用 offset 继续。',
  permission: 'read',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: '正则表达式' },
      path: { type: 'string', description: '搜索起点，默认为 root' },
      glob: { type: 'string', description: '可选文件过滤模式' },
      offset: { type: 'number', description: '跳过前若干个匹配，默认 0' },
      limit: { type: 'number', description: '本次最多返回的匹配数' }
    },
    required: ['pattern']
  }
};

export const runGrepTool = async (
  { roots, primaryRoot }: FileToolContext,
  input: unknown
): Promise<FileToolResult> => {
  const parsed = validateInput(inputSchema, input);
  const target = isAbsolute(parsed.path ?? '.')
    ? (parsed.path ?? '.')
    : resolve(primaryRoot, parsed.path ?? '.');
  const base = await resolveSearchRoot(roots, target);
  let matcher: RegExp;
  try {
    matcher = new RegExp(parsed.pattern, 'i');
  } catch {
    return {
      ok: false,
      output: '',
      error: { code: 'INVALID_PATTERN', message: '正则表达式不合法' }
    };
  }
  const fileMatcher = parsed.glob ? globToRegExp(parsed.glob) : undefined;
  const offset = parsed.offset ?? 0;
  const limit = parsed.limit ?? MAX_SEARCH_RESULTS;
  const lines: string[] = [];
  let bytes = 0;
  let matched = 0;
  let capped = false;
  await walkFiles(base, base, async (path, relativePath) => {
    if (fileMatcher && !fileMatcher.test(relativePath)) return false;
    const info = await stat(path);
    if (info.size > MAX_GREP_FILE_BYTES) return false;
    const buffer = await readFile(path);
    if (buffer.includes(0)) return false;
    for (const [index, line] of buffer.toString('utf8').split(/\r?\n/).entries()) {
      if (!matcher.test(line)) continue;
      matched += 1;
      if (matched <= offset) continue;
      if (lines.length >= limit || bytes >= MAX_GREP_OUTPUT_BYTES) {
        capped = true;
        return true;
      }
      const item = `${relativePath}:${index + 1}: ${line.slice(0, 500)}`;
      lines.push(item);
      bytes += Buffer.byteLength(item, 'utf8') + 1;
    }
    return false;
  });
  if (matched === 0) {
    return { ok: true, output: '', error: { code: 'NO_MATCHES', message: '没有匹配内容' } };
  }
  const more = capped || matched > offset + lines.length;
  const output = lines.join('\n');
  return {
    ok: true,
    output: more
      ? `${output}${output ? '\n' : ''}...[还有更多匹配，可用 offset=${offset + lines.length} 继续]`
      : output
  };
};
