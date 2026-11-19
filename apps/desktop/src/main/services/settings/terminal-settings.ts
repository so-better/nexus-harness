/**
 * 终端设置：默认值、JSON 持久化与最小校验。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DEFAULT_TERMINAL_SETTINGS,
  terminalSettingsSchema,
  type TerminalSettings
} from '@shared/ipc/contracts';
import { getAppDataPaths } from '../storage/paths';

const FILE_NAME = 'terminal.json';

export const loadTerminalSettings = async (settingsDir?: string): Promise<TerminalSettings> => {
  try {
    const raw = await readFile(join(settingsDir ?? getAppDataPaths().settings, FILE_NAME), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'fontFamily' in parsed) {
      const legacy = parsed as Record<string, unknown>;
      delete legacy['fontFamily'];
      legacy['fontSize'] = 12;
    }
    const result = terminalSettingsSchema.safeParse(parsed);
    return result.success ? result.data : DEFAULT_TERMINAL_SETTINGS;
  } catch {
    return DEFAULT_TERMINAL_SETTINGS;
  }
};

export const saveTerminalSettings = async (
  settings: TerminalSettings,
  settingsDir?: string
): Promise<TerminalSettings> => {
  const parsed = terminalSettingsSchema.parse(settings);
  const directory = settingsDir ?? getAppDataPaths().settings;
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, FILE_NAME), `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  return parsed;
};
