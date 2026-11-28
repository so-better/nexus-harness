/**
 * 插件内部共享工具与文案；独立模块以打断 renderer 与各视图之间的循环导入。
 */

import { ref } from 'nexus/vue';
import { getPalette } from 'nexus/theme';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;

export const isEnglish = () => document.documentElement.lang.toLowerCase().startsWith('en');

/** 当前主题模式（读取 <html data-theme>） */
export const currentMode = () =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

/** 当前主题调色板（宿主 nexus/theme 提供）；显式传入 mode 可在 computed 中建立主题依赖 */
export const palette = (mode) => getPalette(mode ?? currentMode());

export const formatNumber = (value) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value ?? 0);

export const formatCompact = (value) =>
  new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value ?? 0);

/** 时间标签；withHour 用于小时粒度的时间序列 */
export const formatTime = (value, withHour = false) =>
  new Intl.DateTimeFormat(
    undefined,
    withHour
      ? { month: 'short', day: 'numeric', hour: '2-digit' }
      : { month: 'short', day: 'numeric' }
  ).format(value);

export const formatDuration = (ms) => `${(Math.max(0, ms) / 1000).toFixed(1)}s`;

export const tokensOf = (usage) => (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);

/** 当前激活会话 id（会话头 chip 挂载时更新），供看板/统计页响应式使用 */
export const activeSessionIdRef = ref(null);

// ---- 时间区间 ----

export const startOfDay = (ms) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export const endOfDay = (ms) => {
  const d = new Date(ms);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};

/** 预置日期范围的起点；'all' 与 'custom' 返回 undefined，由调用方处理 */
export const rangeStart = (preset) => {
  const now = Date.now();
  if (preset === 'today') return startOfDay(now);
  if (preset === 'week') {
    const dow = (new Date(now).getDay() + 6) % 7;
    return startOfDay(now - dow * DAY_MS);
  }
  if (preset === 'month') {
    const d = new Date(now);
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  }
  if (preset === 'year') {
    const d = new Date(now);
    return new Date(d.getFullYear(), 0, 1).getTime();
  }
  return undefined;
};

/** 与 [from, to] 等长的前一个区间，用于环比；任一端缺失或区间非法时返回 null */
export const previousWindow = (from, to) => {
  if (from == null || to == null) return null;
  const span = to - from;
  if (!(span > 0)) return null;
  return { from: from - span, to: from };
};

// ---- 数值 ----

/** 单次均值；calls 为 0 时返回 0 */
export const average = (total, calls) => (calls > 0 ? total / calls : 0);

/** 环比变化率（返回比率而非百分数）；上一个值为 0 时返回 null */
export const pctChange = (current, previous) => {
  if (!(previous > 0)) return null;
  return (current - previous) / previous;
};

/** 带符号的百分比文案，绝对值较大时省略小数 */
export const formatSignedPercent = (ratio) => {
  const value = (ratio ?? 0) * 100;
  const abs = Math.abs(value);
  const digits = abs >= 10 ? 0 : 1;
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${abs.toFixed(digits)}%`;
};

/**
 * 环比信息：返回 { ratio, text, tone, up }；无可比数据时返回 null。
 * positiveIsGood 决定配色语义：用量类指标升高用 warning，缓存命中率升高用 success。
 * paletteSource 用于在 computed 中传入由 mode 派生的调色板，保证主题切换后色彩正确。
 */
export const deltaInfo = (current, previous, positiveIsGood = false, paletteSource) => {
  const ratio = pctChange(current, previous);
  if (ratio == null || !Number.isFinite(ratio)) return null;
  const p = paletteSource ?? palette();
  const up = ratio >= 0;
  const tone = up === positiveIsGood ? p.success : p.warning;
  return { ratio, text: formatSignedPercent(ratio), tone, up };
};

/** 按总数取前 limit 项，其余合并为「其他」一行，便于图表/排行聚焦 */
export const topWithOther = (rows, limit, otherLabel) => {
  if (!rows || rows.length <= limit) return rows ?? [];
  const head = rows.slice(0, limit);
  const rest = rows.slice(limit);
  const sum = (key) => rest.reduce((acc, row) => acc + (row[key] ?? 0), 0);
  return [
    ...head,
    {
      key: '__other__',
      label: otherLabel,
      inputTokens: sum('inputTokens'),
      outputTokens: sum('outputTokens'),
      totalTokens: sum('totalTokens'),
      cacheReadTokens: sum('cacheReadTokens'),
      cacheWriteTokens: sum('cacheWriteTokens'),
      cost: 0,
      calls: sum('calls')
    }
  ];
};

/** 从时间序列中提取某个字段的数值数组，供迷你趋势线使用 */
export const seriesValues = (series, key = 'totalTokens') =>
  (series ?? []).map((point) => point[key] ?? 0);

export const labels = () =>
  isEnglish()
    ? {
        usage: 'Usage',
        session: 'Session',
        all: 'All sessions',
        last7: '7 days',
        last30: '30 days',
        allTime: 'All time',
        today: 'Today',
        thisWeek: 'This week',
        thisMonth: 'This month',
        thisYear: 'This year',
        custom: 'Custom',
        from: 'From',
        to: 'To',
        pickSession: 'Choose session',
        scope: 'Scope',
        range: 'Range',
        unitTokens: 'tokens',
        unitCalls: 'calls',
        input: 'Input',
        output: 'Output',
        freshInput: 'Uncached input',
        cacheHit: 'Cache hit rate',
        cacheRead: 'Cache read',
        cacheWrite: 'Cache write',
        cacheTitle: 'Cache',
        cacheNote: 'Cache reads cut fresh input and cost.',
        total: 'Total',
        calls: 'Calls',
        avgPerCall: 'Avg / call',
        avgPerDay: 'Avg / day',
        activeDays: 'Active days',
        peak: 'Peak',
        share: 'Share',
        lastUsed: 'Last used',
        vsPrev: 'vs prev',
        context: 'Context',
        contextUsed: 'Used',
        contextRemaining: 'Remaining',
        contextWindow: 'Window',
        reservedOutput: 'Reserved output',
        breakdown: 'Breakdown (est.)',
        breakdownSystem: 'System prompt',
        breakdownTools: 'Tool schemas',
        breakdownHistory: 'History',
        byModel: 'By model',
        byProvider: 'By provider',
        sessions: 'Top sessions',
        other: 'Other',
        empty: 'No usage recorded yet.',
        rankEmpty: 'Nothing to rank yet.',
        loading: 'Loading usage…',
        failed: 'Could not load usage.',
        openDashboard: 'Open usage dashboard'
      }
    : {
        usage: '用量',
        session: '当前会话',
        all: '全部会话',
        last7: '7 天',
        last30: '30 天',
        allTime: '全部时间',
        today: '今天',
        thisWeek: '本周',
        thisMonth: '本月',
        thisYear: '今年',
        custom: '自定义',
        from: '开始',
        to: '结束',
        pickSession: '选择会话',
        scope: '作用域',
        range: '时间范围',
        unitTokens: 'tokens',
        unitCalls: '次',
        input: '输入',
        output: '输出',
        freshInput: '未缓存输入',
        cacheHit: '缓存命中率',
        cacheRead: '缓存读',
        cacheWrite: '缓存写',
        cacheTitle: '缓存',
        cacheNote: '缓存读可显著降低未缓存输入与开销。',
        total: '总计',
        calls: '调用',
        avgPerCall: '单次均值',
        avgPerDay: '日均',
        activeDays: '活跃天数',
        peak: '峰值',
        share: '占比',
        lastUsed: '最近使用',
        vsPrev: '环比',
        context: '上下文',
        contextUsed: '已用',
        contextRemaining: '剩余',
        contextWindow: '窗口',
        reservedOutput: '预留输出',
        breakdown: '构成（估算）',
        breakdownSystem: '系统提示',
        breakdownTools: '工具 schema',
        breakdownHistory: '历史消息',
        byModel: '按模型',
        byProvider: '按 Provider',
        sessions: '会话排行',
        other: '其他',
        empty: '还没有用量记录。',
        rankEmpty: '暂无可排行的数据。',
        loading: '正在读取用量…',
        failed: '读取用量失败。',
        openDashboard: '打开用量看板'
      };
