/**
 * 内置插件同步：把安装目录中的内置插件复制到 userData/plugins。
 */

import { cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * 同步参数；测试可注入源目录与目标目录。
 */
export interface SyncBuiltinPluginsOptions {
  sourceDir: string;
  destinationDir: string;
}

/**
 * 已下线的内置插件：升级时从 userData 清理旧副本，避免继续出现在扩展页。
 * 只删除 manifest 特征仍与旧内置插件一致的目录，避免误删同名用户插件。
 */
const RETIRED_BUILTIN_PLUGINS = [{ id: 'nexus.theme-background', name: '晨雾背景' }];

/**
 * 读取并校验最小 manifest，确保目录名与插件 id 一致。
 */
const readPluginId = async (directory: string): Promise<string | undefined> => {
  try {
    const raw = await readFile(join(directory, 'plugin.json'), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return undefined;

    const record = parsed as Record<string, unknown>;
    const id = record['id'];
    const version = record['version'];
    return typeof id === 'string' && typeof version === 'string' ? id : undefined;
  } catch {
    return undefined;
  }
};

/**
 * 同步全部内置插件；返回成功安装的插件 id。
 * 内置插件由应用管理，启动时覆盖同名 userData 副本。
 */
export const syncBuiltinPlugins = async (options: SyncBuiltinPluginsOptions): Promise<string[]> => {
  for (const retired of RETIRED_BUILTIN_PLUGINS) {
    try {
      const manifest = JSON.parse(
        await readFile(join(options.destinationDir, retired.id, 'plugin.json'), 'utf8')
      ) as { id?: unknown; name?: unknown };
      if (manifest.id === retired.id && manifest.name === retired.name) {
        await rm(join(options.destinationDir, retired.id), { recursive: true, force: true });
      }
    } catch {
      // 旧副本不存在或 manifest 无效时跳过
    }
  }

  let entries;
  try {
    entries = await readdir(options.sourceDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const installed: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const source = join(options.sourceDir, entry.name);
    const id = await readPluginId(source);
    if (id !== entry.name) {
      console.error(`内置插件 manifest 无效，已跳过：${entry.name}`);
      continue;
    }

    const destination = join(options.destinationDir, entry.name);
    try {
      await mkdir(options.destinationDir, { recursive: true });
      await rm(destination, { recursive: true, force: true });
      await cp(source, destination, { recursive: true, force: true });
      installed.push(id);
    } catch (error) {
      console.error(`内置插件同步失败：${entry.name}`, error);
    }
  }

  return installed;
};
