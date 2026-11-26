/**
 * 用量 IPC：按查询条件返回聚合统计，不暴露原始事件。
 * 按 sessionId 查询时附带上下文占用快照（模型窗口与当前占用）。
 */
import { ipcMain } from 'electron';
import type { DatabaseSync } from 'node:sqlite';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { fail, ok, type Result } from '@shared/ipc/result';
import { usageStatsInputSchema, type UsageContext, type UsageStats } from '@shared/usage';
import type { ProviderPublic } from '@shared/ipc/contracts';
import { getDatabase } from '../services/storage/database';
import { getSessionContextSnapshot, getUsageStats } from '../services/usage/usage-stats-service';
import { EventStore } from '../services/session/event-store';
import { createSessionService } from '../services/session/create-session-service';
import { providerStore } from '../services/provider/provider-store';

/**
 * 命中 provider/model 配置后解析窗口与当前占用；找不到模型配置时返回 undefined。
 */
const resolveContext = async (
  db: DatabaseSync,
  sessionId: string,
  providerId: string | undefined,
  modelId: string | undefined
): Promise<UsageContext | undefined> => {
  const providers = await providerStore.list();
  let provider: ProviderPublic | undefined = providerId
    ? providers.find((item) => item.id === providerId)
    : undefined;
  // session 未记录 providerId 时，按 modelId 反查所属 provider
  if (!provider && modelId) {
    provider = providers.find((item) => item.models.some((model) => model.id === modelId));
  }
  if (!provider) return undefined;
  const resolvedModelId = modelId ?? provider.defaultModelId;
  const model = provider.models.find((item) => item.id === resolvedModelId);
  if (!model) return undefined;

  const snapshot = getSessionContextSnapshot(db, sessionId);
  return {
    providerId: provider.id,
    modelId: model.id,
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxOutputTokens,
    contextTokens: snapshot.contextTokens,
    ...(snapshot.systemTokens === undefined
      ? {}
      : {
          breakdown: {
            systemTokens: snapshot.systemTokens,
            toolsTokens: snapshot.toolsTokens ?? 0,
            historyTokens: snapshot.historyTokens ?? 0
          }
        })
  };
};

/**
 * 读取会话的上下文快照；解析异常不影响用量统计返回，降级为 undefined。
 */
const resolveSessionContext = async (
  db: DatabaseSync,
  sessionId: string
): Promise<UsageContext | undefined> => {
  try {
    const session = createSessionService(db, new EventStore(db)).get(sessionId);
    if (!session) return undefined;
    return await resolveContext(db, sessionId, session.providerId, session.modelId);
  } catch (error) {
    console.warn('解析会话上下文失败', error);
    return undefined;
  }
};

export const registerUsageIpc = (): void => {
  ipcMain.handle(
    IPC_CHANNELS.usageStats,
    async (_event, rawInput: unknown): Promise<Result<UsageStats>> => {
      const parsed = usageStatsInputSchema.safeParse(rawInput ?? {});
      if (!parsed.success) return fail('USAGE_INVALID_INPUT', '用量查询参数不合法');
      try {
        const db = getDatabase();
        const stats = getUsageStats(db, parsed.data);
        if (!parsed.data.sessionId) return ok(stats);
        const context = await resolveSessionContext(db, parsed.data.sessionId);
        return ok(context ? { ...stats, context } : stats);
      } catch (error) {
        return fail(
          'USAGE_STATS_FAILED',
          error instanceof Error ? error.message : '读取用量统计失败'
        );
      }
    }
  );
};
