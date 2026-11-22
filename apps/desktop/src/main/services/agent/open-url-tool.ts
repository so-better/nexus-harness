/**
 * open_url：用系统默认浏览器打开网页，避免把简单查看任务交给浏览器自动化 MCP。
 */
import { z } from 'zod';
import type { AgentToolDefinition, ToolExecutionResult } from '@nexus/core';

export interface OpenUrlToolOptions {
  openExternal?: (url: string) => Promise<void>;
}

const openUrlSchema = z.object({ url: z.string().min(1).max(4_096) }).strict();

export const openUrlToolDefinition: AgentToolDefinition = {
  name: 'open_url',
  description:
    '用系统默认浏览器打开 http(s) 网页。用户要求“打开/查看网页”时优先使用；只有需要点击、登录、抓取或自动化页面时才使用浏览器 MCP。',
  permission: 'network',
  requiresApproval: true,
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '要打开的 http 或 https 网页地址' }
    },
    required: ['url'],
    additionalProperties: false
  }
};

const failure = (code: string, message: string): ToolExecutionResult => ({
  ok: false,
  output: '',
  error: { code, message }
});

/**
 * 校验并规范化网页地址；只允许 http/https，避免把本地文件或脚本协议交给系统。
 */
const normalizeUrl = (input: unknown): string | undefined => {
  const parsed = openUrlSchema.safeParse(input);
  if (!parsed.success) return undefined;
  const raw = parsed.data.url.trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
};

/**
 * 调用系统默认浏览器打开网页；执行失败返回结构化错误，不抛出到 Agent 循环。
 */
export const executeOpenUrlTool = async (
  input: unknown,
  options: OpenUrlToolOptions = {}
): Promise<ToolExecutionResult> => {
  const url = normalizeUrl(input);
  if (!url) return failure('OPEN_URL_INVALID_INPUT', '只允许打开有效的 HTTP/HTTPS 网页');

  try {
    let openExternal = options.openExternal;
    if (!openExternal) {
      const { shell } = await import('electron');
      openExternal = shell.openExternal.bind(shell);
    }
    await openExternal(url);
    return { ok: true, output: JSON.stringify({ opened: true, url }) };
  } catch (error) {
    return failure(
      'OPEN_URL_FAILED',
      error instanceof Error ? error.message : '打开默认浏览器失败'
    );
  }
};
