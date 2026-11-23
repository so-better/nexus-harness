/**
 * 插件工具：列出、创建、导入、刷新、启用与停用插件。
 */
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { z } from 'zod';
import type { AgentToolDefinition, ToolExecutionResult } from '@nexus/core';
import type { PluginHost } from '../plugins/plugin-host';
import { getPluginHost } from '../plugins/plugin-host-instance';
import { importPluginDirectory, inspectPluginDirectory } from '../plugins/plugin-import-service';
import { getAppDataPaths, getBuiltinPluginsDirectory } from '../storage/paths';

export interface PluginToolOptions {
  host?: PluginHost;
  pluginsDir?: string;
}

const listSchema = z.object({}).strict();
const toggleSchema = z.object({ id: z.string().min(1), enabled: z.boolean() }).strict();
const deleteSchema = z.object({ id: z.string().min(1) }).strict();
const importSchema = z.object({ sourceDir: z.string().min(1) }).strict();
const readSchema = z
  .object({
    id: z.string().min(1),
    path: z.string().min(1).optional()
  })
  .strict();
const updateSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:\.[a-z0-9-]+)+$/),
    files: z.record(z.string(), z.string()).optional(),
    delete: z.array(z.string()).optional()
  })
  .strict()
  .refine((value) => Boolean(Object.keys(value.files ?? {}).length || value.delete?.length), {
    message: '至少需要 files 或 delete'
  });
const createSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:\.[a-z0-9-]+)+$/),
    files: z.record(z.string(), z.string()).optional(),
    fromPluginId: z.string().min(1).optional(),
    overwrite: z.boolean().optional()
  })
  .strict()
  .refine((value) => Boolean(value.files || value.fromPluginId), {
    message: '至少需要 files 或 fromPluginId'
  });

const MAX_FILES = 200;
const MAX_FILE_BYTES = 2_000_000;
const MAX_TOTAL_BYTES = 5_000_000;
const MAX_READ_BYTES = 100_000;

const tool = (
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
  requiresApproval: boolean
): AgentToolDefinition => ({
  name,
  description,
  permission: requiresApproval ? 'write' : 'read',
  requiresApproval,
  inputSchema: { type: 'object', properties, required, additionalProperties: false }
});

export const pluginToolDefinitions: AgentToolDefinition[] = [
  tool('plugin_list', '列出已发现插件的来源、启用状态和错误。', {}, [], false),
  tool(
    'plugin_read',
    '读取已安装插件的 plugin.json 或指定文件，用作插件契约与实现参考；不默认复制内置插件，不依赖工作区授权。',
    {
      id: { type: 'string' },
      path: { type: 'string' }
    },
    ['id'],
    false
  ),
  tool(
    'plugin_reload',
    '重新扫描插件目录并热重载插件；可能执行已启用插件的主进程代码。',
    {},
    [],
    true
  ),
  tool(
    'plugin_set_enabled',
    '启用或停用指定插件；内置插件只能停用，不能卸载。',
    { id: { type: 'string' }, enabled: { type: 'boolean' } },
    ['id', 'enabled'],
    true
  ),
  tool(
    'plugin_delete',
    '删除用户插件并清理插件存储；内置插件不能删除。',
    { id: { type: 'string' } },
    ['id'],
    true
  ),
  tool(
    'plugin_import',
    '从指定目录导入插件，校验 manifest 与入口后重新扫描。',
    { sourceDir: { type: 'string' } },
    ['sourceDir'],
    true
  ),
  tool(
    'plugin_create',
    '创建或覆盖用户插件目录；新插件按 plugin-development Skill 设计，files 必须包含 plugin.json；只有用户明确要求复制或定制现有插件时才使用 fromPluginId；依赖需自行打包，受路径和大小限制。',
    {
      id: { type: 'string' },
      files: { type: 'object', additionalProperties: { type: 'string' } },
      fromPluginId: { type: 'string' },
      overwrite: { type: 'boolean' }
    },
    ['id'],
    true
  ),
  tool(
    'plugin_update',
    '局部修改用户插件文件或删除文件；依赖需自行打包；内置插件只读，修改后自动刷新。',
    {
      id: { type: 'string' },
      files: { type: 'object', additionalProperties: { type: 'string' } },
      delete: { type: 'array', items: { type: 'string' } }
    },
    ['id'],
    true
  )
];

const success = (value: unknown): ToolExecutionResult => ({
  ok: true,
  output: JSON.stringify(value)
});

const failure = (code: string, message: string): ToolExecutionResult => ({
  ok: false,
  output: '',
  error: { code, message }
});

const getHost = (options: PluginToolOptions): PluginHost | undefined =>
  options.host ?? getPluginHost();

const getPluginsDir = (options: PluginToolOptions): string =>
  options.pluginsDir ?? getAppDataPaths().plugins;

/**
 * 校验插件文件相对路径，禁止绝对路径、目录穿越和空路径。
 */
const safePluginFile = (file: string): boolean => {
  const normalized = file.replace(/\\/g, '/');
  const segments = normalized.split('/');
  return (
    Boolean(normalized) &&
    !isAbsolute(file) &&
    !segments.some((segment) => !segment || segment === '.' || segment === '..') &&
    !normalized.includes('\0')
  );
};

/**
 * 将模型提供的文件写入临时插件目录，校验 manifest 后再原子替换目标目录。
 */
const writePluginFiles = async (
  pluginsDir: string,
  id: string,
  files: Record<string, string>,
  overwrite: boolean,
  host?: PluginHost,
  fromPluginId?: string
): Promise<{ path: string; manifest: unknown }> => {
  const entries = Object.entries(files);
  if (!entries.length && !fromPluginId) throw new Error('files 或 fromPluginId 至少需要一项');
  if (entries.length > MAX_FILES) throw new Error(`插件文件不能超过 ${MAX_FILES} 个`);
  if (!fromPluginId && !files['plugin.json']) throw new Error('files 必须包含 plugin.json');
  let totalBytes = 0;
  for (const [file, content] of entries) {
    if (!safePluginFile(file)) throw new Error(`插件路径不合法：${file}`);
    if (content.includes('\0')) throw new Error(`插件文件包含空字符：${file}`);
    totalBytes += Buffer.byteLength(content, 'utf8');
    if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) {
      throw new Error(`插件文件过大：${file}`);
    }
  }
  if (totalBytes > MAX_TOTAL_BYTES) throw new Error('插件总大小超过 5MB');

  await mkdir(pluginsDir, { recursive: true });
  const target = join(pluginsDir, id);
  if (!overwrite) {
    try {
      await stat(target);
      throw new Error('插件目录已存在；如需覆盖请传 overwrite: true');
    } catch (error) {
      if (error instanceof Error && error.message.includes('已存在')) throw error;
    }
  }
  const staging = await mkdtemp(join(pluginsDir, '.create-'));
  try {
    if (fromPluginId) {
      const source = host?.list().find((plugin) => plugin.id === fromPluginId);
      if (!source) throw new Error('要复制的插件不存在');
      let sourceDir = join(pluginsDir, fromPluginId);
      try {
        await stat(sourceDir);
      } catch {
        if (source?.source !== 'builtin') throw new Error('要复制的插件目录不存在');
        sourceDir = join(getBuiltinPluginsDirectory(), fromPluginId);
        await stat(sourceDir);
      }
      await cp(sourceDir, staging, { recursive: true, force: true });
      if (!files['plugin.json']) {
        const manifestPath = join(staging, 'plugin.json');
        const copied = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
        copied['id'] = id;
        await writeFile(manifestPath, `${JSON.stringify(copied, null, 2)}\n`, 'utf8');
      }
    }
    for (const [file, content] of entries) {
      const targetFile = join(staging, file);
      await mkdir(dirname(targetFile), { recursive: true });
      await writeFile(targetFile, content, 'utf8');
    }
    const manifest = await inspectPluginDirectory(staging);
    if (manifest.id !== id) throw new Error('plugin.json 的 id 与目录 id 不一致');
    const existing = host?.list().find((plugin) => plugin.id === id);
    if (existing?.source === 'builtin') throw new Error('内置插件不能被覆盖');
    const root = await realpath(staging);
    const realPluginsDir = await realpath(pluginsDir);
    if (!root.startsWith(`${realPluginsDir}/`)) throw new Error('插件目录越界');
    const backup = join(pluginsDir, `.backup-${id}-${Date.now()}`);
    const hadTarget = await stat(target)
      .then(() => true)
      .catch(() => false);
    if (hadTarget) await rename(target, backup);
    try {
      await rename(staging, target);
    } catch (error) {
      if (hadTarget) await rename(backup, target).catch(() => undefined);
      throw error;
    }
    if (hadTarget) {
      await rm(backup, { recursive: true, force: true }).catch((error: unknown) => {
        console.error(`插件旧版本清理失败：${id}`, error);
      });
    }
    return { path: target, manifest };
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
};

/**
 * 执行插件管理工具；创建/导入/启停后由调用方按需 reload。
 */
export const executePluginTool = async (
  name: string,
  input: unknown,
  options: PluginToolOptions = {}
): Promise<ToolExecutionResult> => {
  const host = getHost(options);
  if (!host) return failure('PLUGIN_HOST_UNAVAILABLE', '插件宿主未初始化');

  if (name === 'plugin_list') {
    if (!listSchema.safeParse(input).success) return failure('PLUGIN_INVALID_INPUT', '参数不合法');
    return success({ plugins: host.list() });
  }

  const pluginsDir = getPluginsDir(options);

  if (name === 'plugin_read') {
    const parsed = readSchema.safeParse(input);
    if (!parsed.success) return failure('PLUGIN_INVALID_INPUT', '插件读取参数不合法');
    const plugin = host.list().find((item) => item.id === parsed.data.id);
    if (!plugin) return failure('PLUGIN_NOT_FOUND', '插件不存在');
    const relativePath = parsed.data.path ?? 'plugin.json';
    if (!safePluginFile(relativePath)) {
      return failure('PLUGIN_INVALID_INPUT', '插件文件路径不合法');
    }
    const candidates = [join(pluginsDir, plugin.id)];
    if (plugin.source === 'builtin') candidates.push(join(getBuiltinPluginsDirectory(), plugin.id));
    for (const directory of candidates) {
      try {
        const root = await realpath(directory);
        const target = await realpath(join(directory, relativePath));
        if (target !== root && !target.startsWith(`${root}/`)) continue;
        const info = await stat(target);
        if (!info.isFile()) continue;
        if (info.size > MAX_READ_BYTES) {
          return failure('PLUGIN_FILE_TOO_LARGE', '插件文件超过 100KB 上限');
        }
        return success({
          id: plugin.id,
          path: relativePath,
          content: await readFile(target, 'utf8')
        });
      } catch {
        // 尝试内置目录或其他可用目录
      }
    }
    return failure('PLUGIN_FILE_NOT_FOUND', '插件文件不存在');
  }

  if (name === 'plugin_reload') {
    if (!listSchema.safeParse(input).success) return failure('PLUGIN_INVALID_INPUT', '参数不合法');
    try {
      return success({ plugins: await host.reload() });
    } catch (error) {
      return failure(
        'PLUGIN_RELOAD_FAILED',
        error instanceof Error ? error.message : '刷新插件失败'
      );
    }
  }

  if (name === 'plugin_set_enabled') {
    const parsed = toggleSchema.safeParse(input);
    if (!parsed.success) return failure('PLUGIN_INVALID_INPUT', '插件参数不合法');
    if (!host.list().some((plugin) => plugin.id === parsed.data.id)) {
      return failure('PLUGIN_NOT_FOUND', '插件不存在');
    }
    try {
      return success({ plugins: await host.setEnabled(parsed.data.id, parsed.data.enabled) });
    } catch (error) {
      return failure(
        'PLUGIN_TOGGLE_FAILED',
        error instanceof Error ? error.message : '更新插件状态失败'
      );
    }
  }

  if (name === 'plugin_delete') {
    const parsed = deleteSchema.safeParse(input);
    if (!parsed.success) return failure('PLUGIN_INVALID_INPUT', '插件参数不合法');
    const existing = host.list().find((plugin) => plugin.id === parsed.data.id);
    if (!existing) return failure('PLUGIN_NOT_FOUND', '插件不存在');
    if (existing.source === 'builtin') {
      return failure('PLUGIN_BUILTIN_READONLY', '内置插件不能删除，只能停用');
    }
    try {
      return success({ plugins: await host.uninstall(parsed.data.id) });
    } catch (error) {
      return failure(
        'PLUGIN_DELETE_FAILED',
        error instanceof Error ? error.message : '删除插件失败'
      );
    }
  }

  if (name === 'plugin_import') {
    const parsed = importSchema.safeParse(input);
    if (!parsed.success) return failure('PLUGIN_INVALID_INPUT', '插件路径不合法');
    try {
      const inspected = await inspectPluginDirectory(parsed.data.sourceDir, host.getHostVersion());
      const existing = host.list().find((plugin) => plugin.id === inspected.id);
      if (existing?.source === 'builtin') {
        return failure('PLUGIN_BUILTIN_PROTECTED', '不能导入与内置插件同名的目录');
      }
      const manifest = await importPluginDirectory({
        sourceDir: parsed.data.sourceDir,
        pluginsDir,
        hostVersion: host.getHostVersion()
      });
      return success({ manifest, plugins: await host.reload() });
    } catch (error) {
      return failure(
        'PLUGIN_IMPORT_FAILED',
        error instanceof Error ? error.message : '导入插件失败'
      );
    }
  }

  if (name === 'plugin_update') {
    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) return failure('PLUGIN_INVALID_INPUT', '插件更新参数不合法');
    const existing = host.list().find((plugin) => plugin.id === parsed.data.id);
    if (!existing) return failure('PLUGIN_NOT_FOUND', '插件不存在');
    if (existing.source === 'builtin')
      return failure('PLUGIN_BUILTIN_READONLY', '内置插件不能修改');
    const target = join(pluginsDir, parsed.data.id);
    const backup = join(pluginsDir, `.backup-${parsed.data.id}-${Date.now()}`);
    let staging = '';
    try {
      await stat(target);
      staging = await mkdtemp(join(pluginsDir, '.update-'));
      await cp(target, staging, { recursive: true, force: true });
      const files = parsed.data.files ?? {};
      if (Object.keys(files).length > MAX_FILES)
        throw new Error(`插件文件不能超过 ${MAX_FILES} 个`);
      if ((parsed.data.delete?.length ?? 0) > MAX_FILES)
        throw new Error(`删除文件不能超过 ${MAX_FILES} 个`);
      let totalBytes = 0;
      for (const [file, content] of Object.entries(files)) {
        if (!safePluginFile(file)) throw new Error(`插件路径不合法：${file}`);
        totalBytes += Buffer.byteLength(content, 'utf8');
        if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) {
          throw new Error(`插件文件过大：${file}`);
        }
        const targetFile = join(staging, file);
        await mkdir(dirname(targetFile), { recursive: true });
        await writeFile(targetFile, content, 'utf8');
      }
      if (totalBytes > MAX_TOTAL_BYTES) throw new Error('插件总大小超过 5MB');
      for (const file of parsed.data.delete ?? []) {
        if (!safePluginFile(file)) throw new Error(`插件路径不合法：${file}`);
        await rm(join(staging, file), { recursive: true, force: true });
      }
      const manifest = await inspectPluginDirectory(staging);
      if (manifest.id !== parsed.data.id) throw new Error('不能通过更新修改插件 id');
      const hadTarget = await stat(target)
        .then(() => true)
        .catch(() => false);
      if (hadTarget) await rename(target, backup);
      try {
        await rename(staging, target);
      } catch (error) {
        if (hadTarget) await rename(backup, target).catch(() => undefined);
        throw error;
      }
      if (hadTarget) {
        await rm(backup, { recursive: true, force: true }).catch((error: unknown) => {
          console.error(`插件旧版本清理失败：${parsed.data.id}`, error);
        });
      }
      return success({ path: target, manifest, plugins: await host.reload() });
    } catch (error) {
      if (staging) await rm(staging, { recursive: true, force: true }).catch(() => undefined);
      return failure(
        'PLUGIN_UPDATE_FAILED',
        error instanceof Error ? error.message : '更新插件失败'
      );
    }
  }

  if (name === 'plugin_create') {
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) return failure('PLUGIN_INVALID_INPUT', '插件文件参数不合法');
    try {
      const created = await writePluginFiles(
        pluginsDir,
        parsed.data.id,
        parsed.data.files ?? {},
        parsed.data.overwrite === true,
        host,
        parsed.data.fromPluginId
      );
      return success({ ...created, plugins: await host.reload() });
    } catch (error) {
      return failure(
        'PLUGIN_CREATE_FAILED',
        error instanceof Error ? error.message : '创建插件失败'
      );
    }
  }

  return failure('PLUGIN_UNKNOWN_ACTION', `未知插件操作：${name}`);
};
