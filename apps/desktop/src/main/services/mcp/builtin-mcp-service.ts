/**
 * 内置 MCP 模板：只补齐 userData 中缺失的 Server，不覆盖用户配置。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mcpServerConfigSchema } from '@shared/mcp';

interface RawConfig {
  mcpServers?: Record<string, unknown>;
}

/**
 * 读取内置模板并合并到用户 mcp.json；返回新增的 Server id。
 * 已存在的同名 Server 保持用户内容不变，避免升级时覆盖用户修改。
 */
export const syncBuiltinMcpConfig = async (
  sourceFile: string,
  destinationDirectory: string
): Promise<string[]> => {
  let builtinRaw: string;
  try {
    builtinRaw = await readFile(sourceFile, 'utf8');
  } catch {
    return [];
  }

  let builtin: RawConfig;
  try {
    builtin = JSON.parse(builtinRaw) as RawConfig;
  } catch {
    return [];
  }
  const builtinServers = builtin.mcpServers;
  if (!builtinServers || typeof builtinServers !== 'object' || Array.isArray(builtinServers)) {
    return [];
  }

  await mkdir(destinationDirectory, { recursive: true });
  const target = join(destinationDirectory, 'mcp.json');
  let current: RawConfig = {};
  let currentRaw: string | undefined;
  try {
    currentRaw = await readFile(target, 'utf8');
  } catch {
    // 配置不存在时用空配置接收内置模板
  }
  if (currentRaw !== undefined) {
    try {
      current = JSON.parse(currentRaw) as RawConfig;
    } catch {
      // 用户配置损坏时保留原文件，避免启动时覆盖用户数据
      console.warn('[mcp] 用户 mcp.json 无效，保留原文件', target);
      return [];
    }
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      console.warn('[mcp] 用户 mcp.json 结构无效，保留原文件', target);
      return [];
    }
    if (
      current.mcpServers !== undefined &&
      (typeof current.mcpServers !== 'object' || Array.isArray(current.mcpServers))
    ) {
      console.warn('[mcp] 用户 mcpServers 结构无效，保留原文件', target);
      return [];
    }
    current.mcpServers ??= {};
  }

  const currentServers = current.mcpServers ?? {};
  const added: string[] = [];
  for (const [id, value] of Object.entries(builtinServers)) {
    if (id in currentServers) continue;
    if (!mcpServerConfigSchema.safeParse(value).success) continue;
    currentServers[id] = value;
    added.push(id);
  }
  current.mcpServers = currentServers;
  if (!added.length && (await readFile(target, 'utf8').catch(() => '')) !== '') return [];
  await writeFile(target, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
  return added;
};
