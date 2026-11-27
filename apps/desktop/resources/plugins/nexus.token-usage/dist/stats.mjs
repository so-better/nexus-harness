/**
 * 用量统计整页（左侧导航栏「用量统计」入口）：日期范围 + 会话筛选，
 * 使用宿主共享的 nexus/vue、nexus/naive-ui、nexus/theme 与 nexus/echarts。
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
  NDataTable,
  NDatePicker,
  NEmpty,
  NGrid,
  NGridItem,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSpin
} from 'nexus/naive-ui';
import { DAY_MS, activeSessionIdRef, formatCompact, formatNumber, isEnglish, labels, palette } from './util.mjs';
import { Chart, barOption, donutOption, lineOption } from './charts.mjs';
import { contextCard, statCard } from './cards.mjs';
import { ensureBaseStyles, provide, useThemeMode } from './ui.mjs';

const startOfDay = (ms) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const endOfDay = (ms) => {
  const d = new Date(ms);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};
const rangeStart = (preset) => {
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

export const mountStatsPage = (element, ctx) => {
  ensureBaseStyles();
  const text = labels();
  const en = isEnglish();

  const View = defineComponent({
    setup() {
      const mode = useThemeMode();
      const preset = ref('month');
      const sessionId = ref(null);
      const customRange = ref([Date.now() - 6 * DAY_MS, Date.now()]);
      const sessions = ref([]);
      const stats = ref(null);
      const loading = ref(false);
      let request = 0;
      let timer;

      const computeQuery = () => {
        let from;
        let to;
        if (preset.value === 'custom') {
          const [a, b] = customRange.value ?? [];
          from = a != null ? startOfDay(a) : undefined;
          to = b != null ? endOfDay(b) : undefined;
        } else if (preset.value === 'all') {
          from = undefined;
          to = undefined;
        } else {
          from = rangeStart(preset.value);
          to = Date.now();
        }
        return {
          ...(sessionId.value ? { sessionId: sessionId.value } : {}),
          ...(from !== undefined ? { from } : {}),
          ...(to !== undefined ? { to } : {}),
          bucket: sessionId.value ? 'run' : 'day'
        };
      };

      const refresh = async () => {
        const current = ++request;
        loading.value = true;
        try {
          const result = await ctx.usage.getStats(computeQuery());
          if (current !== request) return;
          if (!sessionId.value) sessions.value = result.sessions;
          stats.value = result;
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
        offRemoved = ctx.events.on('session.removed', schedule);
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
        if (current) {
          options.push({ label: text.session, value: current });
        }
        for (const s of sessions.value) {
          if (s.sessionId === current) continue;
          options.push({
            label: `${s.title || s.sessionId} · ${formatCompact(s.totalTokens)}`,
            value: s.sessionId
          });
        }
        return options;
      });
      const scopeLabel = computed(() => {
        if (!sessionId.value) return text.all;
        return sessions.value.find((s) => s.sessionId === sessionId.value)?.title || text.session;
      });
      const rangeLabel = computed(
        () => presetOptions.value.find(([value]) => value === preset.value)?.[1] ?? ''
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
        {
          title: text.total,
          key: 'totalTokens',
          align: 'right',
          render: (row) => formatNumber(row.totalTokens)
        },
        { title: text.calls, key: 'calls', align: 'right', render: (row) => formatNumber(row.calls) }
      ]);

      const charts = () => {
        const s = stats.value;
        if (!s || !s.totals.calls) return h(NEmpty, { description: text.empty });
        const p = palette();
        const hero = h('div', { class: 'nu-hero' }, [
          h('div', { class: 'nu-hero__copy' }, [
            h('span', { class: 'nu-hero__eyebrow' }, text.usage),
            h('strong', { class: 'nu-hero__value' }, formatNumber(s.totals.totalTokens)),
            h('span', { class: 'nu-hero__sub' }, `${scopeLabel.value} · ${rangeLabel.value}`)
          ]),
          h('div', { class: 'nu-hero__side' }, [
            h('div', { class: 'nu-hero__stat' }, [
              h('strong', {}, formatNumber(s.totals.calls)),
              h('span', {}, text.calls)
            ])
          ])
        ]);
        const blocks = [
          hero,
          h(
            NGrid,
            { cols: 4, 'x-gap': 12, 'y-gap': 12, responsive: 'screen', itemResponsive: true },
            () =>
              metric.value.map((m) =>
                h(NGridItem, {}, () => statCard(m.label, m.value, { suffix: m.suffix, tone: m.tone }))
              )
          ),
          ...(sessionId.value && s.context ? [contextCard(s.context, text)] : []),
          h(NCard, { size: 'small', title: text.usage }, () =>
            h(Chart, { option: lineOption(s.series ?? [], p, text), height: '320px', theme: mode.value, label: text.usage })
          ),
          h(
            NGrid,
            { cols: 2, 'x-gap': 12, 'y-gap': 12, responsive: 'screen', itemResponsive: true },
            () => [
              h(NGridItem, {}, () =>
                h(NCard, { size: 'small', title: text.byModel }, () =>
                  (s.models ?? []).length
                    ? h(Chart, { option: donutOption(s.models, p, text), height: '280px', theme: mode.value, label: text.byModel })
                    : h(NEmpty, { size: 'small', description: text.empty })
                )
              ),
              h(NGridItem, {}, () =>
                h(NCard, { size: 'small', title: text.byProvider }, () =>
                  (s.providers ?? []).length
                    ? h(Chart, { option: barOption(s.providers, p, text), height: '280px', theme: mode.value, label: text.byProvider })
                    : h(NEmpty, { size: 'small', description: text.empty })
                )
              )
            ]
          )
        ];
        if (!sessionId.value && (s.sessions ?? []).length) {
          blocks.push(
            h(NCard, { size: 'small', title: text.sessions }, () =>
              h(NDataTable, {
                columns: sessionColumns.value,
                data: s.sessions,
                size: 'small',
                maxHeight: 320,
                rowProps: (row) => ({ style: 'cursor:pointer', onClick: () => (sessionId.value = row.sessionId) })
              })
            )
          );
        }
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
                    { value: preset.value, size: 'small', 'onUpdate:value': (v) => (preset.value = v) },
                    () => presetOptions.value.map(([value, label]) => h(NRadioButton, { value }, () => label))
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
                loading.value ? h(NSpin, { size: 'small' }) : null
              ])
            ]),
            charts()
          ])
        );
    }
  });

  const app = createApp(View);
  app.mount(element);
  return () => app.unmount();
};
