/**
 * 用量看板（弹窗）：会话/全局 + 近 7/30 天，KPI + 环比 + 构成趋势 + 排行。
 * 由会话头入口经 ctx.views.open('usage.dashboard') 打开。
 */

import { computed, createApp, defineComponent, h, onMounted, ref, watch } from 'nexus/vue';
import { NCard, NEmpty, NGrid, NGridItem, NRadioButton, NRadioGroup, NSpin } from 'nexus/naive-ui';
import {
  DAY_MS,
  activeSessionIdRef,
  average,
  deltaInfo,
  isEnglish,
  labels,
  palette,
  previousWindow,
  seriesValues
} from './util.mjs';
import { Chart, donutOption, trendOption } from './charts.mjs';
import { contextCard, heroBand, rankList, statCard } from './cards.mjs';
import { ensureBaseStyles, provide, useThemeMode } from './ui.mjs';

export const mountDashboard = (element, ctx) => {
  ensureBaseStyles();
  const text = labels();
  const en = isEnglish();

  const View = defineComponent({
    setup() {
      const mode = useThemeMode();
      const activeId = activeSessionIdRef;
      const scope = ref(activeId.value ? 'session' : 'all');
      const days = ref(30);
      const metric = ref('tokens');
      const stats = ref(null);
      const prevTotals = ref(null);
      const loading = ref(false);
      let request = 0;

      /** 组装查询；bucket 在会话范围内按 run 分组，其余按天 */
      const buildQuery = (sessionScoped, from, to) => ({
        ...(sessionScoped && activeId.value ? { sessionId: activeId.value } : {}),
        ...(from !== undefined ? { from } : {}),
        ...(to !== undefined ? { to } : {}),
        bucket: sessionScoped ? 'run' : 'day'
      });

      const refresh = async () => {
        const current = ++request;
        loading.value = true;
        const sessionScoped = scope.value === 'session';
        try {
          const to = Date.now();
          const from = days.value ? to - days.value * DAY_MS : undefined;
          const prev = from !== undefined ? previousWindow(from, to) : null;
          const [cur, before] = await Promise.all([
            ctx.usage.getStats(buildQuery(sessionScoped, from, to)),
            prev
              ? ctx.usage.getStats({ ...buildQuery(false, prev.from, prev.to), bucket: 'day' })
              : Promise.resolve(null)
          ]);
          if (current !== request) return;
          stats.value = cur;
          prevTotals.value = before?.totals ?? null;
        } catch (error) {
          ctx.logger.error(String(error));
        } finally {
          if (current === request) loading.value = false;
        }
      };
      onMounted(refresh);
      watch([scope, days, activeId], refresh);

      const scopeLabel = computed(() => (scope.value === 'session' ? text.session : text.all));
      const rangeLabel = computed(() =>
        days.value === 7 ? text.last7 : days.value === 30 ? text.last30 : text.allTime
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
        const read = t.cacheReadTokens ?? 0;
        const write = t.cacheWriteTokens ?? 0;
        if (read || write) {
          const rate = t.inputTokens > 0 ? read / t.inputTokens : 0;
          const prevRate =
            prev && prev.inputTokens > 0 ? (prev.cacheReadTokens ?? 0) / prev.inputTokens : null;
          cards.push({
            label: text.cacheHit,
            value: Math.round(rate * 100),
            suffix: '%',
            tone: p.success,
            delta: prevRate != null ? deltaInfo(rate, prevRate, true, p) : null
          });
        }
        return cards;
      });

      const cards = () => {
        const s = stats.value;
        if (!s || !s.totals.calls) return h(NEmpty, { description: text.empty });
        const p = palette();
        const t = s.totals;
        const prev = prevTotals.value;
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
              }
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
          ...(scope.value === 'session' && s.context ? [contextCard(s.context, text)] : []),
          h(
            NGrid,
            { cols: 2, 'x-gap': 12, 'y-gap': 12, responsive: 'screen', itemResponsive: true },
            () => [
              h(NGridItem, {}, () =>
                h(NCard, { size: 'small', title: text.usage }, () =>
                  h(Chart, {
                    option: trendOption(s.series ?? [], p, text, metric.value),
                    height: '260px',
                    theme: mode.value,
                    label: text.usage
                  })
                )
              ),
              h(NGridItem, {}, () =>
                h(NCard, { size: 'small', title: text.byModel }, () =>
                  (s.models ?? []).length
                    ? h(Chart, {
                        option: donutOption(s.models, p, text),
                        height: '260px',
                        theme: mode.value,
                        label: text.byModel
                      })
                    : h(NEmpty, { size: 'small', description: text.empty })
                )
              )
            ]
          )
        ];
        if (scope.value === 'all' && (s.sessions ?? []).length) {
          blocks.push(
            h(NCard, { size: 'small', title: text.sessions }, () =>
              rankList(s.sessions.slice(0, 8), {
                total: t.totalTokens,
                tone: p.accent,
                labelKey: 'title'
              })
            )
          );
        }
        return h('div', { class: 'nu-stack' }, blocks);
      };

      return () =>
        provide(mode, en, () =>
          h('div', { class: 'nu-dashboard' }, [
            h('div', { class: 'nu-toolbar' }, [
              h('div', { class: 'nu-field' }, [
                h('span', { class: 'nu-toolbar__label' }, text.scope),
                h(
                  NRadioGroup,
                  { value: scope.value, size: 'small', 'onUpdate:value': (v) => (scope.value = v) },
                  () => [
                    h(
                      NRadioButton,
                      { value: 'session', disabled: !activeId.value },
                      () => text.session
                    ),
                    h(NRadioButton, { value: 'all' }, () => text.all)
                  ]
                )
              ]),
              h('div', { class: 'nu-field' }, [
                h('span', { class: 'nu-toolbar__label' }, text.range),
                h(
                  NRadioGroup,
                  { value: days.value, size: 'small', 'onUpdate:value': (v) => (days.value = v) },
                  () => [
                    h(NRadioButton, { value: 7 }, () => text.last7),
                    h(NRadioButton, { value: 30 }, () => text.last30),
                    h(NRadioButton, { value: 0 }, () => text.allTime)
                  ]
                )
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
            ]),
            cards()
          ])
        );
    }
  });

  const app = createApp(View);
  app.mount(element);
  return () => app.unmount();
};
