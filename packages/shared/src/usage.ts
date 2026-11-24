/**
 * 用量摘要与查询契约：供 UI、主进程统计服务与插件看板共享。
 */

import { z } from 'zod';

/**
 * 单条消息或单次调用的用量摘要。
 */
export interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  /** 提示缓存写入 token（Anthropic 等）；未提供时视为 0 */
  cacheWriteTokens?: number;
  /** 提示缓存读取 token（Anthropic 等）；未提供时视为 0 */
  cacheReadTokens?: number;
  cost?: number;
}

/**
 * 统计时间桶：按天、小时或 Run 聚合。
 */
export const usageBucketSchema = z.enum(['day', 'hour', 'run']);

/**
 * 用量统计查询；省略时间范围时覆盖全部本地事件。
 */
export const usageStatsInputSchema = z
  .object({
    from: z.number().int().nonnegative().optional(),
    to: z.number().int().nonnegative().optional(),
    sessionId: z.string().min(1).optional(),
    bucket: usageBucketSchema.optional()
  })
  .strict();

import type {
  PluginUsageBreakdown,
  PluginUsageBucket,
  PluginUsageQuery,
  PluginUsageSeriesPoint,
  PluginUsageSession,
  PluginUsageStats,
  PluginUsageTotals
} from './plugin-api';

export type UsageBucket = PluginUsageBucket;
export type UsageStatsInput = PluginUsageQuery;
export type UsageTotals = PluginUsageTotals;
export type UsageSeriesPoint = PluginUsageSeriesPoint;
export type UsageBreakdown = PluginUsageBreakdown;
export type UsageSessionStat = PluginUsageSession;
export type UsageStats = PluginUsageStats;

/**
 * 空汇总，供服务初始化与测试复用。
 */
export const emptyUsageTotals = (): UsageTotals => ({
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  cost: 0,
  calls: 0
});
