/**
 * 皮肤工具：查询可用皮肤，或应用/清除皮肤。
 */
import { z } from 'zod';
import type { AgentToolDefinition, ToolExecutionResult } from '@nexus/core';
import type { PluginSkinSelection } from '@shared/plugin';
import { getPluginHost } from '../plugins/plugin-host-instance';
import { loadSkinSelection } from '../settings/skin-settings';
import { applySkinSelection } from '../settings/skin-service';

export interface SkinOption {
  pluginId: string;
  pluginName: string;
  skinId: string;
  title: string;
}

export interface SkinToolOptions {
  settingsDir?: string;
  available?: SkinOption[];
  onChange?: (selection: PluginSkinSelection | null) => void;
}

const skinListSchema = z.object({}).strict();
const skinApplySchema = z
  .object({
    pluginId: z.string().min(1).optional(),
    skinId: z.string().min(1).optional(),
    clear: z.boolean().optional()
  })
  .strict()
  .refine(
    (value) =>
      value.clear === true
        ? !value.pluginId && !value.skinId
        : Boolean(value.pluginId && value.skinId),
    { message: '应用皮肤需要 pluginId 与 skinId，清除皮肤请使用 clear: true' }
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

export const skinToolDefinitions: AgentToolDefinition[] = [
  tool('skin_list', '列出已启用插件提供的皮肤，以及当前选中的皮肤。', {}, [], false),
  tool(
    'skin_apply',
    '应用或清除皮肤；应用时传 pluginId、skinId，清除时传 clear: true。',
    {
      pluginId: { type: 'string' },
      skinId: { type: 'string' },
      clear: { type: 'boolean' }
    },
    [],
    true
  )
];

/**
 * 从插件宿主读取可用皮肤；禁用插件不参与选择。
 */
const listAvailable = (): SkinOption[] =>
  (getPluginHost()?.list() ?? [])
    .filter((plugin) => plugin.enabled && plugin.permissions.includes('ui.skin'))
    .flatMap((plugin) =>
      plugin.contributes.skins.map((skin) => ({
        pluginId: plugin.id,
        pluginName: plugin.name,
        skinId: skin.id,
        title: skin.title
      }))
    );

const snapshot = async (
  options: SkinToolOptions
): Promise<{ active: PluginSkinSelection | null; skins: Array<SkinOption & { active: boolean }> }> => {
  const active = await loadSkinSelection(options.settingsDir);
  const skins = (options.available ?? listAvailable()).map((skin) => ({
    ...skin,
    active: skin.pluginId === active?.pluginId && skin.skinId === active.skinId
  }));
  return { active, skins };
};

const success = (
  value: { active: PluginSkinSelection | null; skins: Array<SkinOption & { active: boolean }> }
): ToolExecutionResult => ({ ok: true, output: JSON.stringify(value) });

const failure = (code: string, message: string): ToolExecutionResult => ({
  ok: false,
  output: '',
  error: { code, message }
});

/**
 * 执行皮肤工具；应用后通过宿主广播让渲染层立即切换背景。
 */
export const executeSkinTool = async (
  name: string,
  input: unknown,
  options: SkinToolOptions = {}
): Promise<ToolExecutionResult> => {
  if (name === 'skin_list') {
    if (!skinListSchema.safeParse(input).success) {
      return failure('SKIN_INVALID_INPUT', '参数不合法');
    }
    return success(await snapshot(options));
  }

  if (name !== 'skin_apply') {
    return failure('SKIN_UNKNOWN_ACTION', `未知皮肤操作：${name}`);
  }

  const parsed = skinApplySchema.safeParse(input);
  if (!parsed.success) {
    return failure('SKIN_INVALID_INPUT', '皮肤参数不合法');
  }

  try {
    const skins = options.available ?? listAvailable();
    let selection: PluginSkinSelection | null = null;
    if (!parsed.data.clear) {
      const match = skins.find(
        (skin) =>
          skin.pluginId === parsed.data.pluginId && skin.skinId === parsed.data.skinId
      );
      if (!match) return failure('SKIN_NOT_FOUND', '指定的皮肤不存在或插件未启用');
      selection = { pluginId: match.pluginId, skinId: match.skinId };
    }
    await applySkinSelection(selection, options.settingsDir, 'agent');
    options.onChange?.(selection);
    return success(await snapshot(options));
  } catch (error) {
    return failure(
      'SKIN_APPLY_FAILED',
      error instanceof Error ? error.message : '应用皮肤失败'
    );
  }
};
