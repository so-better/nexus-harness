/**
 * 用量统计整页（左侧导航栏「用量统计」入口）：日期范围 + 会话筛选 + 指标切换，
 * 包含环比、构成趋势、缓存效率与排行；使用宿主共享的 nexus/vue、nexus/naive-ui、nexus/theme 与 nexus/echarts。
 */

import {
  computed,
  createApp,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  watch
} from 'nexus/vue';
import {
  NCard,
  NDatePicker,
  NEmpty,
  NGrid,
  NGridItem,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSpin
} from 'nexus/naive-ui';
import {
  DAY_MS,
  activeSessionIdRef,
  average,
  deltaInfo,
  endOfDay,
  formatCompact,
  isEnglish,
  labels,
  palette,
  previousWindow,
  rangeStart,
  seriesValues,
  startOfDay
} from './util.mjs';
import { Chart, barOption, donutOption, trendOption } from './charts.mjs';
import { cacheCard, contextCard, heroBand, rankList, statCard } from './cards.mjs';
import { ensureBaseStyles, provide, useThemeMode } from './ui.mjs';

export const mountStatsPage = (element, ctx) => {
  ensureBaseStyles();
  const text = labels();
  const en = isEnglish();

  const View = defineComponent({
    setup() {
      const mode = useThemeMode();
      const preset = ref('month');
      const sessionId = ref(null);
      const metric = ref('tokens');
      const customRange = ref([Date.now() - 6 * DAY_MS, Date.now()]);
      const sessions = ref([]);
      const stats = ref(null);
      const prevTotals = ref(null);
      const bucket = ref('day');
      const loading = ref(false);
      let request = 0;
      let timer;

      const computeRange = () => {
        if (preset.value === 'custom') {
          const [a, b] = customRange.value ?? [];
          return {
            from: a != null ? startOfDay(a) : undefined,
            to: b != null ? endOfDay(b) : undefined
          };
        }
        if (preset.value === 'all') return { from: undefined, to: undefined };
        return { from: rangeStart(preset.value), to: Date.now() };
      };

      const refresh = async () => {
        const current = ++request;
        loading.value = true;
        try {
          const { from, to } = computeRange();
          // 会话范围按 run 分组；短区间（今天/近两天）按小时，其余按天
          const resolvedBucket = sessionId.value
            ? 'run'
            : from != null && to != null && to - from <= 2 * DAY_MS
              ? 'hour'
              : 'day';
          bucket.value = resolvedBucket;
          const base = {
            ...(sessionId.value ? { sessionId: sessionId.value } : {}),
            ...(from !== undefined ? { from } : {}),
            ...(to !== undefined ? { to } : {}),
            bucket: resolvedBucket
          };
          const prev = previousWindow(from, to);
          const [cur, before] = await Promise.all([
            ctx.usage.getStats(base),
            prev
              ? ctx.usage.getStats({ ...base, from: prev.from, to: prev.to, bucket: 'day' })
              : Promise.resolve(null)
          ]);
          if (current !== request) return;
          if (!sessionId.value) sessions.value = cur.sessions;
          stats.value = cur;
          prevTotals.value = before?.totals ?? null;
        } catch (error) {
          ctx.logger.error(String(error));
        } finally {
          if (current === request) loading.value = false;
        }
      };

      const schedule = () => {
        clearTimeout(timer);
        timer = setTimeout(refresh, 500);
      };
      let offUsage;
      let offRemoved;
      onMounted(() => {
        offUsage = ctx.events.on('usage.recorded', schedule);
        offRemoved = ctx.events.on('session.removed', (_payload, meta) => {
          // 删除的正是当前筛选的会话时清空选择；watch 会立即刷新并重新加载会话列表
          if (meta?.sessionId && meta.sessionId === sessionId.value) {
            sessionId.value = null;
          } else {
            schedule();
          }
        });
        refresh();
      });
      onBeforeUnmount(() => {
        clearTimeout(timer);
        offUsage?.();
        offRemoved?.();
      });
      watch([preset, sessionId], refresh);
      watch(customRange, () => preset.value === 'custom' && refresh());

      const presetOptions = computed(() => [
        ['today', text.today],
        ['week', text.thisWeek],
        ['month', text.thisMonth],
        ['year', text.thisYear],
        ['all', text.allTime],
        ['custom', text.custom]
      ]);
      const sessionOptions = computed(() => {
        const current = activeSessionIdRef.value;
        const options = [{ label: text.all, value: null }];
        if (current) options.push({ label: text.session, value: current });
        for (const row of sessions.value) {
          if (row.sessionId === current) continue;
          options.push({
            label: `${row.title || row.sessionId} · ${formatCompact(row.totalTokens)}`,
            value: row.sessionId
          });
        }
        return options;
      });
      const scopeLabel = computed(() => {
        if (!sessionId.value) return text.all;
        return (
          sessions.value.find((row) => row.sessionId === sessionId.value)?.title || text.session
        );
      });
      const rangeLabel = computed(
        () => presetOptions.value.find(([value]) => value === preset.value)?.[1] ?? ''
      );

      const metricCards = computed(() => {
        const s = stats.value;
        if (!s?.totals) return [];
        const t = s.totals;
        const prev = prevTotals.value;
        const p = palette(mode.value);
        const sv = s.series ?? [];
        const cards = [
          {
            label: text.total,
            value: t.totalTokens,
            tone: p.accent,
            spark: seriesValues(sv, 'totalTokens'),
            delta: deltaInfo(t.totalTokens, prev?.totalTokens, false, p)
          },
          {
            label: text.input,
            value: t.inputTokens,
            tone: p.accent,
            spark: seriesValues(sv, 'inputTokens')
          },
          {
            label: text.output,
            value: t.outputTokens,
            tone: p.idle,
            spark: seriesValues(sv, 'outputTokens')
          },
          {
            label: text.calls,
            value: t.calls,
            spark: seriesValues(sv, 'calls'),
            delta: deltaInfo(t.calls, prev?.calls, false, p)
          },
          { label: text.avgPerCall, value: Math.round(average(t.totalTokens, t.calls)) }
        ];
        if (bucket.value === 'day' && sv.length) {
          cards.push({
            label: text.avgPerDay,
            value: Math.round(t.totalTokens / sv.length),
            caption: `${sv.length} ${text.activeDays}`
          });
        }
        return cards;
      });

      const panels = () => {
        const s = stats.value;
        if (!s || !s.totals.calls) return h(NEmpty, { description: text.empty });
        const p = palette();
        const t = s.totals;
        const prev = prevTotals.value;
        const sv = s.series ?? [];
        const peak = sv.length ? Math.max(...sv.map((point) => point.totalTokens)) : 0;
        const read = t.cacheReadTokens ?? 0;
        const write = t.cacheWriteTokens ?? 0;

        const blocks = [
          heroBand({
            eyebrow: text.usage,
            value: t.totalTokens,
            sub: `${scopeLabel.value} · ${rangeLabel.value}`,
            delta: deltaInfo(t.totalTokens, prev?.totalTokens, false, p),
            stats: [
              {
                value: String(t.calls),
                label: text.calls,
                delta: deltaInfo(t.calls, prev?.calls, false, p)
              },
              {
                value: String(Math.round(average(t.totalTokens, t.calls))),
                label: text.avgPerCall
              },
              { value: formatCompact(peak), label: text.peak }
            ]
          }),
          h(
            NGrid,
            { cols: 4, 'x-gap': 12, 'y-gap': 12, responsive: 'screen', itemResponsive: true },
            () =>
              metricCards.value.map((card) =>
                h(NGridItem, {}, () => statCard(card.label, card.value, card))
              )
          ),
          ...(sessionId.value && s.context ? [contextCard(s.context, text)] : []),
          h(NCard, { size: 'small', title: text.usage }, () =>
            h(Chart, {
              option: trendOption(sv, p, text, metric.value),
              height: '320px',
              theme: mode.value,
              label: text.usage
            })
          ),
          h(
            NGrid,
            { cols: 2, 'x-gap': 12, 'y-gap': 12, responsive: 'screen', itemResponsive: true },
            () => [
              h(NGridItem, {}, () =>
                h(NCard, { size: 'small', title: text.byModel }, () =>
                  (s.models ?? []).length
                    ? h(Chart, {
                        option: donutOption(s.models, p, text),
                        height: '280px',
                        theme: mode.value,
                        label: text.byModel
                      })
                    : h(NEmpty, { size: 'small', description: text.empty })
                )
              ),
              h(NGridItem, {}, () =>
                h(NCard, { size: 'small', title: text.byProvider }, () =>
                  (s.providers ?? []).length
                    ? h(Chart, {
                        option: barOption(s.providers, p, text),
                        height: '280px',
                        theme: mode.value,
                        label: text.byProvider
                      })
                    : h(NEmpty, { size: 'small', description: text.empty })
                )
              )
            ]
          ),
          ...(read || write ? [cacheCard(t, text)] : []),
          ...(!sessionId.value && (s.sessions ?? []).length
            ? [
                h(NCard, { size: 'small', title: text.sessions }, () =>
                  rankList(s.sessions.slice(0, 10), {
                    total: t.totalTokens,
                    tone: p.accent,
                    labelKey: 'title',
                    onSelect: (row) => (sessionId.value = row.sessionId)
                  })
                )
              ]
            : [])
        ];
        return h('div', { class: 'nu-stack' }, blocks);
      };

      return () =>
        provide(mode, en, () =>
          h('div', { class: 'nu-page' }, [
            h('div', { class: 'nu-header' }, [
              h('div', {}, [
                h('div', { class: 'nu-title' }, text.usage),
                h('div', { class: 'nu-sub' }, `${scopeLabel.value} · ${rangeLabel.value}`)
              ]),
              h('div', { class: 'nu-toolbar' }, [
                h('div', { class: 'nu-field' }, [
                  h('span', { class: 'nu-toolbar__label' }, text.range),
                  h(
                    NRadioGroup,
                    {
                      value: preset.value,
                      size: 'small',
                      'onUpdate:value': (v) => (preset.value = v)
                    },
                    () =>
                      presetOptions.value.map(([value, label]) =>
                        h(NRadioButton, { value }, () => label)
                      )
                  ),
                  preset.value === 'custom'
                    ? h(NDatePicker, {
                        type: 'daterange',
                        size: 'small',
                        value: customRange.value,
                        clearable: false,
                        'onUpdate:value': (v) => (customRange.value = v)
                      })
                    : null
                ]),
                h('div', { class: 'nu-field' }, [
                  h('span', { class: 'nu-toolbar__label' }, text.scope),
                  h(NSelect, {
                    value: sessionId.value,
                    options: sessionOptions.value,
                    size: 'small',
                    style: 'width: 240px',
                    placeholder: text.pickSession,
                    'onUpdate:value': (v) => (sessionId.value = v)
                  })
                ]),
                h('div', { class: 'nu-field' }, [
                  h('span', { class: 'nu-toolbar__label' }, text.metric),
                  h(
                    NRadioGroup,
                    {
                      value: metric.value,
                      size: 'small',
                      'onUpdate:value': (v) => (metric.value = v)
                    },
                    () => [
                      h(NRadioButton, { value: 'tokens' }, () => text.tokens),
                      h(NRadioButton, { value: 'calls' }, () => text.calls)
                    ]
                  )
                ]),
                loading.value ? h(NSpin, { size: 'small' }) : null
              ])
            ]),
            panels()
          ])
        );
    }
  });

  const app = createApp(View);
  app.mount(element);
  return () => app.unmount();
};
