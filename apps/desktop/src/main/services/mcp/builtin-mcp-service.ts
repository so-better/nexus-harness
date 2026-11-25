/**
 * 内置 MCP 模板：补齐 userData 中缺失的 Server，不覆盖用户配置。
 * 对已退役的内置 Server，仅在配置仍是原样内置版本时移除。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mcpServerConfigSchema } from '@shared/mcp';

interface RawConfig {
  mcpServers?: Record<string, unknown>;
}

/**
 * 已退役的内置 Server 快照：仅当当前配置与快照完全一致（未被用户修改）时才移除。
 */
const RETIRED_BUILTIN_SERVERS: Record<string, unknown> = {
  'browser-use': {
    type: 'stdio',
    command: 'uvx',
    args: ['--from', 'browser-use==1.0.6', 'browser-use', '--cli-mcp'],
    enabled: true
  },
  'microsoft-learn': {
    type: 'http',
    url: 'https://learn.microsoft.com/api/mcp',
    enabled: true
  }
};

/** 稳定序列化：对象键排序后比较，避免键顺序差异导致漏判。 */
const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
};

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
  let changed = false;

  // 先移除“仍是原样内置版本”的退役 Server；用户改过的保留
  for (const [id, snapshot] of Object.entries(RETIRED_BUILTIN_SERVERS)) {
    if (!(id in currentServers)) continue;
    if (stableStringify(currentServers[id]) !== stableStringify(snapshot)) continue;
    delete currentServers[id];
    changed = true;
  }

  const added: string[] = [];
  for (const [id, value] of Object.entries(builtinServers)) {
    if (id in currentServers) continue;
    if (!mcpServerConfigSchema.safeParse(value).success) continue;
    currentServers[id] = value;
    added.push(id);
    changed = true;
  }
  current.mcpServers = currentServers;
  if (!changed) return [];
  await writeFile(target, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
  return added;
};
