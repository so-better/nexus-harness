/**
 * 插件内部共享工具与文案；独立模块以打断 renderer 与各视图之间的循环导入。
 */

import { ref } from 'nexus/vue';
import { getPalette } from 'nexus/theme';

export const DAY_MS = 24 * 60 * 60 * 1000;

export const isEnglish = () => document.documentElement.lang.toLowerCase().startsWith('en');

/** 当前主题模式（读取 <html data-theme>） */
export const currentMode = () =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

/** 当前主题调色板（宿主 nexus/theme 提供） */
export const palette = () => getPalette(currentMode());

export const formatNumber = (value) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value ?? 0);

export const formatCompact = (value) =>
  new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value ?? 0);

export const formatTime = (value) =>
  new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit' }).format(
    value
  );

export const formatDuration = (ms) => `${(Math.max(0, ms) / 1000).toFixed(1)}s`;

export const tokensOf = (usage) => (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);

/** 当前激活会话 id（会话头 chip 挂载时更新），供看板/统计页响应式使用 */
export const activeSessionIdRef = ref(null);

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
        input: 'Input',
        output: 'Output',
        cacheHit: 'Cache hit rate',
        cacheRead: 'Cache read',
        cacheWrite: 'Cache write',
        total: 'Total',
        calls: 'Calls',
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
        sessions: 'Sessions',
        other: 'Other',
        empty: 'No usage recorded yet.',
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
        input: '输入',
        output: '输出',
        cacheHit: '缓存命中率',
        cacheRead: '缓存读',
        cacheWrite: '缓存写',
        total: '总计',
        calls: '调用',
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
        loading: '正在读取用量…',
        failed: '读取用量失败。',
        openDashboard: '打开用量看板'
      };
