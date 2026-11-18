/**
 * 开机自启偏好：默认开启，保存到 userData/settings/startup.json。
 */

import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getAppDataPaths } from '../storage/paths';

const startupFileName = 'startup.json';

/**
 * 读取已保存的偏好；文件缺失或内容无效时返回 undefined。
 */
const readAutoLaunchSetting = async (directory: string): Promise<boolean | undefined> => {
  try {
    const raw = await readFile(join(directory, startupFileName), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !('autoLaunch' in parsed)) return undefined;
    const value = (parsed as { autoLaunch?: unknown }).autoLaunch;
    return typeof value === 'boolean' ? value : undefined;
  } catch {
    return undefined;
  }
};

/**
 * 读取开机自启设置；缺失或无效时默认开启。
 */
export const loadAutoLaunch = async (settingsDir?: string): Promise<boolean> => {
  const directory = settingsDir ?? getAppDataPaths().settings;
  return (await readAutoLaunchSetting(directory)) ?? true;
};

/**
 * 保存开机自启设置。
 */
export const saveAutoLaunch = async (enabled: boolean, settingsDir?: string): Promise<void> => {
  const directory = settingsDir ?? getAppDataPaths().settings;

  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, startupFileName),
    `${JSON.stringify({ autoLaunch: enabled }, null, 2)}\n`,
    'utf8'
  );
};

/**
 * 将偏好同步到操作系统；开发态不注册登录项。
 * 返回是否成功应用，失败只记录日志，不阻断调用方。
 */
export const applyAutoLaunch = (enabled: boolean): boolean => {
  if (!app.isPackaged) return true;

  try {
    app.setLoginItemSettings({ openAtLogin: enabled });
    return true;
  } catch (error) {
    console.error('设置开机自启失败', error);
    return false;
  }
};

/**
 * 启动时初始化：首次运行默认开启；之后以系统登录项状态为准并回写偏好。
 */
export const initializeAutoLaunch = async (settingsDir?: string): Promise<boolean> => {
  const directory = settingsDir ?? getAppDataPaths().settings;
  const saved = await readAutoLaunchSetting(directory);

  if (saved === undefined) {
    const applied = applyAutoLaunch(true);
    await saveAutoLaunch(applied, directory);
    return applied;
  }

  if (!app.isPackaged) return saved;

  try {
    const actual = app.getLoginItemSettings().openAtLogin;
    if (actual !== saved) await saveAutoLaunch(actual, directory);
    return actual;
  } catch {
    return saved;
  }
};
