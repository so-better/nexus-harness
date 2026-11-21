/**
 * 用量 IPC：按查询条件返回聚合统计，不暴露原始事件。
 */
import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { fail, ok, type Result } from '@shared/ipc/result';
import { usageStatsInputSchema, type UsageStats } from '@shared/usage';
import { getDatabase } from '../services/storage/database';
import { getUsageStats } from '../services/usage/usage-stats-service';

export const registerUsageIpc = (): void => {
  ipcMain.handle(IPC_CHANNELS.usageStats, (_event, rawInput: unknown): Result<UsageStats> => {
    const parsed = usageStatsInputSchema.safeParse(rawInput ?? {});
    if (!parsed.success) return fail('USAGE_INVALID_INPUT', '用量查询参数不合法');
    try {
      return ok(getUsageStats(getDatabase(), parsed.data));
    } catch (error) {
      return fail(
        'USAGE_STATS_FAILED',
        error instanceof Error ? error.message : '读取用量统计失败'
      );
    }
  });
};
