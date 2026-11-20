/**
 * 通用设置工具：语言、开机自启与通知角标；不涉及任何密钥。
 */
import { z } from 'zod';
import type { AgentToolDefinition, ToolExecutionResult } from '@nexus/core';
import type { GeneralSettingsState } from '@shared/ipc/contracts';
import { languageSchema, notificationBadgeStyleSchema } from '@shared/ipc/contracts';
import {
  applyAutoLaunch,
  loadAutoLaunch,
  saveAutoLaunch
} from '../settings/startup-settings';
import { loadLanguage, saveLanguage } from '../settings/language-settings';
import {
  loadNotificationBadge,
  saveNotificationBadge
} from '../settings/notification-settings';
import {
  setNotificationBadgeStyle,
  setNotificationLanguage
} from '../notifications/notification-service';

export interface GeneralSettingsToolOptions {
  settingsDir?: string;
  onChange?: (state: GeneralSettingsState) => void;
}

export const loadGeneralSettings = async (
  settingsDir?: string
): Promise<GeneralSettingsState> => {
  const [language, autoLaunch, notificationBadge] = await Promise.all([
    loadLanguage(settingsDir),
    loadAutoLaunch(settingsDir),
    loadNotificationBadge(settingsDir)
  ]);
  return { language, autoLaunch, notificationBadge };
};

const generalGetSchema = z.object({}).strict();
const generalUpdateSchema = z
  .object({
    language: languageSchema.optional(),
    autoLaunch: z.boolean().optional(),
    notificationBadge: notificationBadgeStyleSchema.optional()
  })
  .strict()
  .refine(
    (value) =>
      value.language !== undefined ||
      value.autoLaunch !== undefined ||
      value.notificationBadge !== undefined,
    { message: '至少需要一个设置项' }
  );

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

export const generalSettingsToolDefinitions: AgentToolDefinition[] = [
  tool('general_settings_get', '读取语言、开机自启和通知角标设置。', {}, [], false),
  tool(
    'general_settings_update',
    '修改语言、开机自启或通知角标；至少提供一项。',
    {
      language: { type: 'string', enum: ['zh-CN', 'en-US'] },
      autoLaunch: { type: 'boolean' },
      notificationBadge: { type: 'string', enum: ['dot', 'count'] }
    },
    [],
    true
  )
];

const success = (state: GeneralSettingsState): ToolExecutionResult => ({
  ok: true,
  output: JSON.stringify(state)
});

const failure = (code: string, message: string): ToolExecutionResult => ({
  ok: false,
  output: '',
  error: { code, message }
});

/**
 * 执行通用设置工具；写操作先应用系统副作用，再持久化并广播快照。
 */
export const executeGeneralSettingsTool = async (
  name: string,
  input: unknown,
  options: GeneralSettingsToolOptions = {}
): Promise<ToolExecutionResult> => {
  if (name === 'general_settings_get') {
    if (!generalGetSchema.safeParse(input).success) {
      return failure('GENERAL_SETTINGS_INVALID_INPUT', '参数不合法');
    }
    return success(await loadGeneralSettings(options.settingsDir));
  }

  if (name !== 'general_settings_update') {
    return failure('GENERAL_SETTINGS_UNKNOWN_ACTION', `未知通用设置操作：${name}`);
  }

  const parsed = generalUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return failure('GENERAL_SETTINGS_INVALID_INPUT', '通用设置参数不合法');
  }
  const data = parsed.data;

  try {
    if (data.autoLaunch !== undefined) {
      if (!applyAutoLaunch(data.autoLaunch)) {
        return failure('GENERAL_SETTINGS_AUTO_LAUNCH_FAILED', '无法更新系统开机自启设置');
      }
      await saveAutoLaunch(data.autoLaunch, options.settingsDir);
    }

    if (data.language !== undefined) {
      await saveLanguage(data.language, options.settingsDir);
      setNotificationLanguage(data.language);
    }

    if (data.notificationBadge !== undefined) {
      await saveNotificationBadge(data.notificationBadge, options.settingsDir);
      setNotificationBadgeStyle(data.notificationBadge);
    }

    const state = await loadGeneralSettings(options.settingsDir);
    options.onChange?.(state);
    return success(state);
  } catch (error) {
    return failure(
      'GENERAL_SETTINGS_UPDATE_FAILED',
      error instanceof Error ? error.message : '更新通用设置失败'
    );
  }
};
