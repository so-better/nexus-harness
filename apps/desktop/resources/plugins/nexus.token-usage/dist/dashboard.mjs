/**
 * 用量看板（弹窗）：会话/全局 + 近 7/30 天，Naive UI 卡片 + ECharts 折线/环形。
 * 由会话头入口经 ctx.views.open('usage.dashboard') 打开。
 */

import { computed, createApp, defineComponent, h, onBeforeUnmount, onMounted, ref, watch } from 'nexus/vue';
import {
  NCard,
  NDataTable,
  NEmpty,
  NGrid,
  NGridItem,
  NRadioButton,
  NRadioGroup,
  NSpin
} from 'nexus/naive-ui';
import { DAY_MS, activeSessionIdRef, formatNumber, isEnglish, labels, palette } from './util.mjs';
import { Chart, donutOption, lineOption } from './charts.mjs';
import { contextCard, statCard } from './cards.mjs';
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
      const stats = ref(null);
      const loading = ref(false);
      let request = 0;

      const refresh = async () => {
        const current = ++request;
        loading.value = true;
        try {
          const from = days.value ? Date.now() - days.value * DAY_MS : undefined;
          const result = await ctx.usage.getStats({
            ...(scope.value === 'session' && activeId.value ? { sessionId: activeId.value } : {}),
            ...(from ? { from } : {}),
            bucket: scope.value === 'session' ? 'run' : 'day'
          });
          if (current !== request) return;
          stats.value = result;
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

      const metric = computed(() => {
        const t = stats.value?.totals;
        if (!t) return [];
        const p = palette();
        const items = [
          { label: text.total, value: t.totalTokens, tone: p.accent },
          { label: text.input, value: t.inputTokens, tone: p.accent },
          { label: text.output, value: t.outputTokens, tone: p.idle },
          { label: text.calls, value: t.calls }
        ];
        const cacheRead = t.cacheReadTokens ?? 0;
        const cacheWrite = t.cacheWriteTokens ?? 0;
        if (cacheRead || cacheWrite) {
          const rate = t.inputTokens > 0 ? cacheRead / t.inputTokens : 0;
          items.push({ label: text.cacheHit, value: Math.round(rate * 100), suffix: '%', tone: p.success });
          items.push({ label: text.cacheRead, value: cacheRead, tone: p.success });
          items.push({ label: text.cacheWrite, value: cacheWrite, tone: p.warning });
        }
        return items;
      });

      const sessionColumns = computed(() => [
        { title: text.sessions, key: 'title' },
        { title: text.total, key: 'totalTokens', align: 'right', render: (row) => formatNumber(row.totalTokens) },
        { title: text.calls, key: 'calls', align: 'right', render: (row) => formatNumber(row.calls) }
      ]);

      const hero = () => {
        const t = stats.value.totals;
        return h('div', { class: 'nu-hero' }, [
          h('div', { class: 'nu-hero__copy' }, [
            h('span', { class: 'nu-hero__eyebrow' }, text.usage),
            h('strong', { class: 'nu-hero__value' }, formatNumber(t.totalTokens)),
            h('span', { class: 'nu-hero__sub' }, `${scopeLabel.value} · ${rangeLabel.value}`)
          ]),
          h('div', { class: 'nu-hero__side' }, [
            h('div', { class: 'nu-hero__stat' }, [
              h('strong', {}, formatNumber(t.calls)),
              h('span', {}, text.calls)
            ])
          ])
        ]);
      };

      const body = () => {
        const s = stats.value;
        if (!s || !s.totals.calls) return h(NEmpty, { description: text.empty });
        const p = palette();
        const blocks = [
          hero(),
          h(
            NGrid,
            { cols: 4, 'x-gap': 12, 'y-gap': 12, responsive: 'screen', itemResponsive: true },
            () =>
              metric.value.map((m) =>
                h(NGridItem, {}, () => statCard(m.label, m.value, { suffix: m.suffix, tone: m.tone }))
              )
          ),
          ...(scope.value === 'session' && s.context ? [contextCard(s.context, text)] : []),
          h(NGrid, { cols: 2, 'x-gap': 12, 'y-gap': 12, responsive: 'screen', itemResponsive: true }, () => [
            h(NGridItem, {}, () =>
              h(NCard, { size: 'small', title: text.usage }, () =>
                h(Chart, { option: lineOption(s.series ?? [], p, text), height: '260px', theme: mode.value, label: text.usage })
              )
            ),
            h(NGridItem, {}, () =>
              h(NCard, { size: 'small', title: text.byModel }, () =>
                (s.models ?? []).length
                  ? h(Chart, { option: donutOption(s.models, p, text), height: '260px', theme: mode.value, label: text.byModel })
                  : h(NEmpty, { size: 'small', description: text.empty })
              )
            )
          ])
        ];
        if (scope.value === 'all' && (s.sessions ?? []).length) {
          blocks.push(
            h(NCard, { size: 'small', title: text.sessions }, () =>
              h(NDataTable, { columns: sessionColumns.value, data: s.sessions, size: 'small', maxHeight: 260 })
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
                    h(NRadioButton, { value: 'session', disabled: !activeId.value }, () => text.session),
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
              loading.value ? h(NSpin, { size: 'small' }) : null
            ]),
            body()
          ])
        );
    }
  });

  const app = createApp(View);
  app.mount(element);
  return () => app.unmount();
};
