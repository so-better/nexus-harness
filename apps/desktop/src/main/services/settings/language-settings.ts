/**
 * 界面语言偏好：默认 zh-CN，保存到 userData/settings/language.json。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { languageSchema, type AppLanguage } from '@shared/ipc/contracts';
import { getAppDataPaths } from '../storage/paths';

const languageFileName = 'language.json';

/**
 * 读取界面语言；文件缺失或无效时回退 zh-CN。
 */
export const loadLanguage = async (settingsDir?: string): Promise<AppLanguage> => {
  const directory = settingsDir ?? getAppDataPaths().settings;
  try {
    const raw = await readFile(join(directory, languageFileName), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !('language' in parsed)) return 'zh-CN';
    const result = languageSchema.safeParse((parsed as { language?: unknown }).language);
    return result.success ? result.data : 'zh-CN';
  } catch {
    return 'zh-CN';
  }
};

/**
 * 保存界面语言。
 */
export const saveLanguage = async (language: AppLanguage, settingsDir?: string): Promise<void> => {
  const directory = settingsDir ?? getAppDataPaths().settings;
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, languageFileName),
    `${JSON.stringify({ language }, null, 2)}\n`,
    'utf8'
  );
};
