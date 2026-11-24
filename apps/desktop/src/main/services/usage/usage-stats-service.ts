/**
 * 用量统计服务：在 SQL 中聚合 usage.recorded，避免把全量事件载入内存。
 */
import type { DatabaseSync } from 'node:sqlite';
import type {
  UsageBreakdown,
  UsageSeriesPoint,
  UsageSessionStat,
  UsageStats,
  UsageStatsInput,
  UsageTotals
} from '@shared/usage';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

interface AggregateRow {
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  cost: number | null;
  calls: number;
}

interface SeriesRow extends AggregateRow {
  key: string;
  start: number;
}

interface SessionRow extends AggregateRow {
  sessionId: string;
  title: string;
  lastUsedAt: number;
}

interface BreakdownRow extends AggregateRow {
  key: string;
  label: string;
}

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const totalsFrom = (row: AggregateRow | undefined): UsageTotals => {
  const inputTokens = toNumber(row?.inputTokens);
  const outputTokens = toNumber(row?.outputTokens);
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cacheReadTokens: toNumber(row?.cacheReadTokens),
    cacheWriteTokens: toNumber(row?.cacheWriteTokens),
    cost: toNumber(row?.cost),
    calls: toNumber(row?.calls)
  };
};

/**
 * 查询并聚合 usage.recorded；筛选、分组和求和全部在 SQLite 内完成。
 */
export const getUsageStats = (db: DatabaseSync, input: UsageStatsInput = {}): UsageStats => {
  const conditions = ["e.type = 'usage.recorded'"];
  const params: Array<string | number> = [];

  if (input.from !== undefined) {
    conditions.push('e.ts >= ?');
    params.push(input.from);
  }
  if (input.to !== undefined) {
    conditions.push('e.ts <= ?');
    params.push(input.to);
  }
  if (input.sessionId) {
    conditions.push('e.session_id = ?');
    params.push(input.sessionId);
  }

  const cte = `WITH usage AS (
    SELECT e.session_id AS sessionId,
           e.run_id AS runId,
           e.ts AS ts,
           s.title AS title,
           COALESCE(CAST(json_extract(e.payload, '$.inputTokens') AS INTEGER), 0) AS inputTokens,
           COALESCE(CAST(json_extract(e.payload, '$.outputTokens') AS INTEGER), 0) AS outputTokens,
           COALESCE(CAST(json_extract(e.payload, '$.cacheReadTokens') AS INTEGER), 0) AS cacheReadTokens,
           COALESCE(CAST(json_extract(e.payload, '$.cacheWriteTokens') AS INTEGER), 0) AS cacheWriteTokens,
           COALESCE(CAST(json_extract(e.payload, '$.cost') AS REAL), 0) AS cost,
           json_extract(e.payload, '$.model') AS model,
           json_extract(e.payload, '$.provider') AS provider
    FROM events e
    JOIN sessions s ON s.id = e.session_id
    WHERE ${conditions.join(' AND ')} AND s.deleted_at IS NULL
  )`;
  const aggregate = `SUM(inputTokens) AS inputTokens,
                     SUM(outputTokens) AS outputTokens,
                     SUM(cacheReadTokens) AS cacheReadTokens,
                     SUM(cacheWriteTokens) AS cacheWriteTokens,
                     SUM(cost) AS cost,
                     COUNT(*) AS calls`;
  const bucket = input.bucket ?? 'day';

  const totalRow = db.prepare(`${cte} SELECT ${aggregate} FROM usage`).get(...params) as
    AggregateRow | undefined;

  const series =
    bucket === 'run'
      ? (db
          .prepare(
            `${cte} SELECT COALESCE(runId, sessionId || ':' || ts) AS key,
                    MIN(ts) AS start,
                    ${aggregate}
             FROM usage
             GROUP BY key
             ORDER BY start ASC`
          )
          .all(...params) as unknown as SeriesRow[])
      : (() => {
          const size = bucket === 'hour' ? HOUR_MS : DAY_MS;
          return db
            .prepare(
              `${cte} SELECT CAST(ts / ? AS INTEGER) * ? AS start,
                      ${aggregate}
               FROM usage
               GROUP BY start
               ORDER BY start ASC`
            )
            .all(...params, size, size) as unknown as SeriesRow[];
        })();

  const sessionRows = db
    .prepare(
      `${cte} SELECT sessionId,
              COALESCE(MAX(title), sessionId) AS title,
              MAX(ts) AS lastUsedAt,
              ${aggregate}
       FROM usage
       GROUP BY sessionId
       ORDER BY lastUsedAt DESC`
    )
    .all(...params) as unknown as SessionRow[];

  const modelRows = db
    .prepare(
      `${cte} SELECT COALESCE(model, 'unknown') AS key,
              COALESCE(model, 'unknown') AS label,
              ${aggregate}
       FROM usage
       GROUP BY key
       ORDER BY SUM(inputTokens + outputTokens) DESC`
    )
    .all(...params) as unknown as BreakdownRow[];

  const providerRows = db
    .prepare(
      `${cte} SELECT COALESCE(provider, 'unknown') AS key,
              COALESCE(provider, 'unknown') AS label,
              ${aggregate}
       FROM usage
       GROUP BY key
       ORDER BY SUM(inputTokens + outputTokens) DESC`
    )
    .all(...params) as unknown as BreakdownRow[];

  return {
    totals: totalsFrom(totalRow),
    series: series.map((row) => ({
      ...totalsFrom(row),
      key: bucket === 'run' ? String(row.key) : String(toNumber(row.start)),
      start: toNumber(row.start)
    })) as UsageSeriesPoint[],
    sessions: sessionRows.map((row) => ({
      ...totalsFrom(row),
      sessionId: row.sessionId,
      title: row.title,
      lastUsedAt: toNumber(row.lastUsedAt)
    })) as UsageSessionStat[],
    models: modelRows.map((row) => ({
      ...totalsFrom(row),
      key: row.key,
      label: row.label
    })) as UsageBreakdown[],
    providers: providerRows.map((row) => ({
      ...totalsFrom(row),
      key: row.key,
      label: row.label
    })) as UsageBreakdown[]
  };
};
