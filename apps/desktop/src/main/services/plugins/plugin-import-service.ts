/**
 * 自定义插件导入：校验插件目录并复制到 userData/plugins。
 */

import { cp, mkdir, mkdtemp, readFile, realpath, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { satisfies } from 'semver';
import { pluginManifestSchema, type PluginManifest } from '@shared/plugin';

export interface ImportPluginOptions {
  sourceDir: string;
  pluginsDir: string;
  hostVersion?: string;
}

/**
 * 插件导入失败使用可展示的业务错误，避免把底层异常直接抛给用户。
 */
export class PluginImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PluginImportError';
  }
}

const ensureEntry = async (source: string, entry: string | undefined): Promise<void> => {
  if (!entry) return;
  const root = await realpath(source);
  const target = await realpath(join(source, entry)).catch(() => undefined);
  if (!target) throw new PluginImportError(`插件入口文件不存在：${entry}`);
  if (target !== root && !target.startsWith(`${root}/`)) {
    throw new PluginImportError(`插件入口路径不合法：${entry}`);
  }
  if (!(await stat(target)).isFile()) {
    throw new PluginImportError(`插件入口不是文件：${entry}`);
  }
};

/**
 * 检查目录是否是有效插件，并校验声明的入口。
 */
export const inspectPluginDirectory = async (
  sourceDir: string,
  hostVersion?: string
): Promise<PluginManifest> => {
  const info = await stat(sourceDir).catch(() => undefined);
  if (!info?.isDirectory()) throw new PluginImportError('请选择一个有效的插件文件夹');

  const rawText = await readFile(join(sourceDir, 'plugin.json'), 'utf8').catch(() => undefined);
  if (rawText === undefined) {
    throw new PluginImportError('所选文件夹不是插件目录：缺少 plugin.json');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(rawText);
  } catch {
    throw new PluginImportError('plugin.json 格式错误，请检查 JSON 语法');
  }

  const parsed = pluginManifestSchema.safeParse(raw);
  if (!parsed.success) {
    const fields = [
      ...new Set(parsed.error.issues.map((issue) => issue.path.join('.') || 'manifest'))
    ];
    throw new PluginImportError(`plugin.json 缺少或错误的字段：${fields.join('、')}`);
  }
  if (
    hostVersion &&
    !satisfies(hostVersion, parsed.data.engines.nexus, { includePrerelease: true })
  ) {
    throw new PluginImportError(
      `插件要求 Nexus ${parsed.data.engines.nexus}，当前宿主版本 ${hostVersion}`
    );
  }
  await ensureEntry(sourceDir, parsed.data.main);
  await ensureEntry(sourceDir, parsed.data.renderer);
  return parsed.data;
};

/**
 * 导入插件；目录名使用 manifest.id，避免依赖源文件夹名称。
 */
export const importPluginDirectory = async (
  options: ImportPluginOptions
): Promise<PluginManifest> => {
  const manifest = await inspectPluginDirectory(options.sourceDir, options.hostVersion);
  await mkdir(options.pluginsDir, { recursive: true });
  const source = await realpath(options.sourceDir);
  const target = join(options.pluginsDir, manifest.id);
  if (source === target) {
    throw new PluginImportError('该插件已经安装，请直接点击重新扫描');
  }

  const staging = await mkdtemp(join(options.pluginsDir, '.import-'));
  try {
    await cp(source, staging, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
    await rename(staging, target);
    return manifest;
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    if (error instanceof PluginImportError) throw error;
    throw new PluginImportError('复制插件文件失败，请检查目录权限和磁盘空间');
  }
};
