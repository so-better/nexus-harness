/**
 * 通知角标偏好：默认红点，可切换为数字计数。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { notificationBadgeStyleSchema, type NotificationBadgeStyle } from '@shared/ipc/contracts';
import { getAppDataPaths } from '../storage/paths';

const FILE_NAME = 'notifications.json';

export const loadNotificationBadge = async (
  settingsDir?: string
): Promise<NotificationBadgeStyle> => {
  try {
    const raw = await readFile(join(settingsDir ?? getAppDataPaths().settings, FILE_NAME), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    const value =
      parsed && typeof parsed === 'object' && 'badgeStyle' in parsed
        ? (parsed as { badgeStyle?: unknown }).badgeStyle
        : undefined;
    const result = notificationBadgeStyleSchema.safeParse(value);
    return result.success ? result.data : 'dot';
  } catch {
    return 'dot';
  }
};

export const saveNotificationBadge = async (
  style: NotificationBadgeStyle,
  settingsDir?: string
): Promise<NotificationBadgeStyle> => {
  const parsed = notificationBadgeStyleSchema.parse(style);
  const directory = settingsDir ?? getAppDataPaths().settings;
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, FILE_NAME),
    `${JSON.stringify({ badgeStyle: parsed }, null, 2)}\n`,
    'utf8'
  );
  return parsed;
};
