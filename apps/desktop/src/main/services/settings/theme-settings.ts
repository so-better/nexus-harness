/**
 * 主题偏好持久化：在设置服务落地前先使用 userData/settings 下的轻量 JSON。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { themeSourceSchema, type ThemeSource } from '@shared/ipc/contracts';
import { getAppDataPaths } from '../storage/paths';

const themeFileName = 'theme.json';

/**
 * 读取已保存的主题来源；文件缺失或内容无效时回退到 system。
 */
export const loadThemeSource = async (settingsDir?: string): Promise<ThemeSource> => {
  const directory = settingsDir ?? getAppDataPaths().settings;

  try {
    const raw = await readFile(join(directory, themeFileName), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || !('source' in parsed)) return 'system';

    const result = themeSourceSchema.safeParse(parsed.source);
    return result.success ? result.data : 'system';
  } catch {
    return 'system';
  }
};

/**
 * 保存主题来源；写入失败时抛错，由调用方转换为结构化错误。
 */
export const saveThemeSource = async (source: ThemeSource, settingsDir?: string): Promise<void> => {
  const directory = settingsDir ?? getAppDataPaths().settings;

  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, themeFileName),
    `${JSON.stringify({ source }, null, 2)}\n`,
    'utf8'
  );
};
