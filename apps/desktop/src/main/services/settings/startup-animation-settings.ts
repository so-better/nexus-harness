/**
 * 全局启动动画选择：保存 pluginId + startupId，由宿主在下次启动时渲染。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pluginStartupSelectionSchema, type PluginStartupSelection } from '@shared/plugin';
import { getAppDataPaths } from '../storage/paths';

const FILE_NAME = 'startup-animation.json';

/**
 * 读取启动动画选择；文件缺失或非法时返回 null。
 */
export const loadStartupSelection = async (
  settingsDir?: string
): Promise<PluginStartupSelection | null> => {
  try {
    const raw = await readFile(join(settingsDir ?? getAppDataPaths().settings, FILE_NAME), 'utf8');
    const parsed = pluginStartupSelectionSchema.safeParse(JSON.parse(raw).selection);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

/**
 * 保存或清除启动动画选择。
 */
export const saveStartupSelection = async (
  selection: PluginStartupSelection | null,
  settingsDir?: string
): Promise<PluginStartupSelection | null> => {
  const parsed = selection === null ? null : pluginStartupSelectionSchema.parse(selection);
  const directory = settingsDir ?? getAppDataPaths().settings;
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, FILE_NAME),
    `${JSON.stringify({ selection: parsed }, null, 2)}\n`,
    'utf8'
  );
  return parsed;
};
