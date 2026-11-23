/**
 * 缓存工具：读取缓存占用并清理文件、产物与日志缓存。
 */
import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import { session } from 'electron';
import type { AgentToolDefinition, ToolExecutionResult } from '@nexus/core';
import { cacheTargetSchema, type CacheInfo, type CacheTarget } from '@shared/ipc/contracts';
import type { AppDataPaths } from '../storage/paths';
import { getAppDataPaths, getMcpWorkdirPath } from '../storage/paths';
import { clearCache, getCacheInfo } from '../cache/cache-service';
import { hasOtherActiveRuns } from './run-registry';

export interface CacheToolOptions {
  paths?: AppDataPaths;
  database?: DatabaseSync;
  runId?: string;
  /** 清理 MCP 缓存前释放连接，清理后重建，避免删除运行中产物。 */
  mcp?: { dispose: () => Promise<void>; prewarm: () => Promise<void> };
}

const cacheGetSchema = z.object({}).strict();
const cacheClearSchema = z.object({ target: cacheTargetSchema }).strict();

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

export const cacheToolDefinitions: AgentToolDefinition[] = [
  tool('cache_get_info', '读取文件、工具产物、日志与 MCP 运行缓存占用。', {}, [], false),
  tool(
    'cache_clear',
    '清理指定缓存；有其他人任务运行时拒绝执行；当前 Run 清理可能删除其引用的产物文件；清理 files/artifacts 时同步删除数据库记录；不删除 MCP 配置。',
    { target: { type: 'string', enum: ['files', 'artifacts', 'logs', 'mcp', 'all'] } },
    ['target'],
    true
  )
];

const success = (value: CacheInfo): ToolExecutionResult => ({
  ok: true,
  output: JSON.stringify(value)
});

const failure = (code: string, message: string): ToolExecutionResult => ({
  ok: false,
  output: '',
  error: { code, message }
});

const cacheDirectories = (paths: AppDataPaths) => ({
  files: paths.files,
  artifacts: paths.artifacts,
  logs: paths.logs,
  mcpWorkdir: getMcpWorkdirPath(paths.mcp)
});

/**
 * 执行缓存工具；AI 当前 Run 可清理缓存，但不能影响其他活跃 Run。
 */
export const executeCacheTool = async (
  name: string,
  input: unknown,
  options: CacheToolOptions = {}
): Promise<ToolExecutionResult> => {
  const paths = options.paths ?? getAppDataPaths();

  if (name === 'cache_get_info') {
    if (!cacheGetSchema.safeParse(input).success) {
      return failure('CACHE_INVALID_INPUT', '参数不合法');
    }
    return success(await getCacheInfo(cacheDirectories(paths)));
  }

  if (name !== 'cache_clear') {
    return failure('CACHE_UNKNOWN_ACTION', `未知缓存操作：${name}`);
  }

  const parsed = cacheClearSchema.safeParse(input);
  if (!parsed.success) return failure('CACHE_INVALID_TARGET', '缓存清理参数不合法');
  if (hasOtherActiveRuns(options.runId)) {
    return failure('CACHE_BUSY', '有其他人任务正在运行，暂不能清理缓存');
  }

  try {
    const resetsMcp = parsed.data.target === 'mcp' || parsed.data.target === 'all';
    if (resetsMcp && options.mcp) {
      await options.mcp.dispose();
    }
    const info = await clearCache(cacheDirectories(paths), parsed.data.target as CacheTarget);
    if (resetsMcp && options.mcp) {
      await options.mcp.prewarm().catch((error: unknown) => {
        console.error('MCP 缓存清理后预热失败', error);
      });
    }
    if (
      (parsed.data.target === 'files' || parsed.data.target === 'all') &&
      !info.failed.includes('files')
    ) {
      options.database?.prepare('DELETE FROM files').run();
    }
    if (
      (parsed.data.target === 'artifacts' || parsed.data.target === 'all') &&
      !info.failed.includes('artifacts')
    ) {
      options.database?.prepare('DELETE FROM artifacts').run();
    }
    if (parsed.data.target === 'all') {
      try {
        await session.defaultSession.clearCache();
      } catch (error) {
        console.error('清理浏览器缓存失败', error);
      }
    }
    return success(info);
  } catch (error) {
    return failure('CACHE_CLEAR_FAILED', error instanceof Error ? error.message : '清理缓存失败');
  }
};
