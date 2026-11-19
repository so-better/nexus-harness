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
  glob: z.string().min(1).max(500).optional()
});

export const grepToolDefinition: FileToolDefinition = {
  name: 'grep',
  description: '在授权目录内搜索文本内容，返回路径、行号与匹配行。',
  permission: 'read',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: '正则表达式' },
      path: { type: 'string', description: '搜索起点，默认为 root' },
      glob: { type: 'string', description: '可选文件过滤模式' }
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
  const lines: string[] = [];
  let bytes = 0;
  await walkFiles(base, base, async (path, relativePath) => {
    if (fileMatcher && !fileMatcher.test(relativePath)) return;
    const info = await stat(path);
    if (info.size > MAX_GREP_FILE_BYTES) return;
    const buffer = await readFile(path);
    if (buffer.includes(0)) return;
    for (const [index, line] of buffer.toString('utf8').split(/\r?\n/).entries()) {
      if (!matcher.test(line)) continue;
      const item = `${relativePath}:${index + 1}: ${line.slice(0, 500)}`;
      lines.push(item);
      bytes += Buffer.byteLength(item, 'utf8') + 1;
      if (lines.length >= MAX_SEARCH_RESULTS || bytes >= MAX_GREP_OUTPUT_BYTES) return true;
    }
    return lines.length >= MAX_SEARCH_RESULTS || bytes >= MAX_GREP_OUTPUT_BYTES;
  });
  if (lines.length === 0) {
    return { ok: true, output: '', error: { code: 'NO_MATCHES', message: '没有匹配内容' } };
  }
  return { ok: true, output: lines.join('\n') };
};
