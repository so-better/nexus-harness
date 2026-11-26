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
  PluginUsageQuery,
  PluginUsageSeriesPoint,
  PluginUsageSession,
  PluginUsageStats,
  PluginUsageTotals
} from './plugin-api';

/** 用量统计查询输入。 */
export type UsageStatsInput = PluginUsageQuery;
/** 用量汇总。 */
export type UsageTotals = PluginUsageTotals;
/** 时间序列数据点。 */
export type UsageSeriesPoint = PluginUsageSeriesPoint;
/** 按维度拆分的用量。 */
export type UsageBreakdown = PluginUsageBreakdown;
/** 单会话用量。 */
export type UsageSessionStat = PluginUsageSession;
/** 用量统计结果。 */
export type UsageStats = PluginUsageStats;
