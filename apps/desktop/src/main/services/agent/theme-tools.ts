/**
 * 主题工具：读取当前主题，或切换 light / dark / system。
 */
import { z } from 'zod';
import type { AgentToolDefinition, ToolExecutionResult } from '@nexus/core';
import { themeSourceSchema, type ThemeInfo } from '@shared/ipc/contracts';
import { getThemeInfo } from '../../app/theme';
import { applyThemeSource } from '../settings/theme-service';

export interface ThemeToolOptions {
  settingsDir?: string;
  onChange?: (info: ThemeInfo) => void;
}

const themeGetSchema = z.object({}).strict();
const themeUpdateSchema = z
  .object({
    source: themeSourceSchema
  })
  .strict();

const tool = (
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
  requiresApproval: boolean
): AgentToolDefinition => ({
  name,
  description,
  permission: requiresApproval ? 'write' : 'read',
  requiresApproval,
  inputSchema: { type: 'object', properties, required, additionalProperties: false }
});

export const themeToolDefinitions: AgentToolDefinition[] = [
  tool('theme_get', '读取当前主题来源与生效主题。', {}, [], false),
  tool(
    'theme_update',
    '切换主题为 light、dark 或 system；system 跟随操作系统。',
    {
      source: { type: 'string', enum: ['light', 'dark', 'system'] }
    },
    ['source'],
    true
  )
];

const success = (info: ThemeInfo): ToolExecutionResult => ({
  ok: true,
  output: JSON.stringify(info)
});

const failure = (code: string, message: string): ToolExecutionResult => ({
  ok: false,
  output: '',
  error: { code, message }
});

/**
 * 执行主题工具；切换后立即广播到所有窗口。
 */
export const executeThemeTool = async (
  name: string,
  input: unknown,
  options: ThemeToolOptions = {}
): Promise<ToolExecutionResult> => {
  if (name === 'theme_get') {
    if (!themeGetSchema.safeParse(input).success) {
      return failure('THEME_INVALID_INPUT', '参数不合法');
    }
    return success(getThemeInfo());
  }

  if (name !== 'theme_update') {
    return failure('THEME_UNKNOWN_ACTION', `未知主题操作：${name}`);
  }

  const parsed = themeUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return failure('THEME_INVALID_INPUT', '主题来源不合法');
  }

  try {
    const info = await applyThemeSource(parsed.data.source, options.settingsDir);
    options.onChange?.(info);
    return success(info);
  } catch (error) {
    return failure(
      'THEME_UPDATE_FAILED',
      error instanceof Error ? error.message : '切换主题失败'
    );
  }
};
