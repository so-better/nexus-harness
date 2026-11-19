/**
 * 媒体搜索配置存储；API Key 只保存在本地。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { searchSettingsSchema, type SearchSettings } from '@shared/search';
import { getAppDataPaths } from '../storage/paths';

const FILE_NAME = 'search.json';

export const loadSearchSettings = async (settingsDir?: string): Promise<SearchSettings | null> => {
  try {
    const raw = await readFile(join(settingsDir ?? getAppDataPaths().settings, FILE_NAME), 'utf8');
    const parsed = searchSettingsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

export const saveSearchSettings = async (
  value: SearchSettings,
  settingsDir?: string
): Promise<SearchSettings> => {
  const parsed = searchSettingsSchema.parse(value);
  const directory = settingsDir ?? getAppDataPaths().settings;
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, FILE_NAME), `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  return parsed;
};
