/**
 * 全局插件皮肤选择：保存 pluginId + skinId，由宿主渲染背景层。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pluginSkinSelectionSchema, type PluginSkinSelection } from '@shared/plugin';
import { getAppDataPaths } from '../storage/paths';

const FILE_NAME = 'skin.json';

export const loadSkinSelection = async (
  settingsDir?: string
): Promise<PluginSkinSelection | null> => {
  try {
    const raw = await readFile(join(settingsDir ?? getAppDataPaths().settings, FILE_NAME), 'utf8');
    const parsed = pluginSkinSelectionSchema.safeParse(JSON.parse(raw).selection);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

export const saveSkinSelection = async (
  selection: PluginSkinSelection | null,
  settingsDir?: string
): Promise<PluginSkinSelection | null> => {
  const parsed = selection === null ? null : pluginSkinSelectionSchema.parse(selection);
  const directory = settingsDir ?? getAppDataPaths().settings;
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, FILE_NAME),
    `${JSON.stringify({ selection: parsed }, null, 2)}\n`,
    'utf8'
  );
  return parsed;
};
