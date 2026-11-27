/**
 * 用量入口：
 * - 会话头（右上角）：Naive UI 按钮（打开用量看板）。
 * - 消息尾部：轻量 DOM 胶囊（每条消息一个，避免逐条挂 Vue 实例的开销）。
 */

import { createApp, defineComponent, h, onMounted } from 'nexus/vue';
import { NButton, NIcon } from 'nexus/naive-ui';
import {
  activeSessionIdRef,
  formatCompact,
  formatDuration,
  formatNumber,
  isEnglish,
  labels,
  tokensOf
} from './util.mjs';
import { provide, useThemeMode } from './ui.mjs';

/** 图表小图标（静态 SVG） */
const chartIconSvg = () =>
  h('svg', { viewBox: '0 0 16 16', fill: 'none', width: 14, height: 14 }, [
    h('path', {
      d: 'M2.5 13.5V2.5M2.5 13.5H14',
      stroke: 'currentColor',
      'stroke-width': 1.4,
      'stroke-linecap': 'round'
    }),
    h('path', {
      d: 'm4.5 10 2.7-3 2.2 2 3.6-4.5',
      stroke: 'currentColor',
      'stroke-width': 1.4,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round'
    })
  ]);

const openDashboard = (ctx) => {
  ctx.views.open('usage.dashboard').catch((error) => ctx.logger.error(String(error)));
};

const metrics = (context, ctx) => {
  const usage = context.usage;
  const text = labels();
  const duration =
    ctx.settings?.showDuration === true && typeof context.durationMs === 'number'
      ? formatDuration(context.durationMs)
      : '';
  const chars =
    ctx.settings?.showChars === true && typeof context.contentChars === 'number'
      ? `${formatNumber(context.contentChars)} ${isEnglish() ? 'chars' : '字'}`
      : '';
  const model =
    context.provider || context.model
      ? [context.provider, context.model].filter(Boolean).join(' / ')
      : '';
  const title = usage
    ? `${text.input} ${formatNumber(usage.inputTokens)} · ${text.output} ${formatNumber(usage.outputTokens)}`
    : text.openDashboard;
  return { usage, duration, chars, model, title, text };
};

/** 会话头入口：Naive UI 按钮 */
const SessionChip = defineComponent({
  props: {
    context: { type: Object, required: true },
    api: { type: Object, required: true }
  },
  setup(props) {
    const mode = useThemeMode();
    const { usage, duration, chars, title, text } = metrics(props.context, props.api);
    onMounted(() => {
      if (props.context.sessionId) activeSessionIdRef.value = props.context.sessionId;
    });
    const label = [usage ? `${text.usage} ${formatCompact(tokensOf(usage))}` : '', duration, chars]
      .filter(Boolean)
      .join(' · ');
    return () =>
      provide(mode, isEnglish(), () =>
        h(
          NButton,
          { quaternary: true, size: 'small', title, onClick: () => openDashboard(props.api) },
          { icon: () => h(NIcon, { size: 14 }, chartIconSvg), default: () => label }
        )
      );
  }
});

const ensureInlineStyle = () => {
  if (document.getElementById('nexus-token-usage-inline')) return;
  const style = document.createElement('style');
  style.id = 'nexus-token-usage-inline';
  style.textContent = `
    .nu-inline { display: inline-block; margin-top: 6px; max-width: 100%; color: var(--nh-color-text-secondary); font-family: var(--nh-font-mono); font-size: 10px; line-height: 1.4; overflow-wrap: anywhere; }
  `;
  document.head.appendChild(style);
};

/** 消息尾部：纯文字（淡色），非入口 */
const mountInlineText = (element, context, ctx) => {
  const { usage, duration, chars, model } = metrics(context, ctx);
  const label = [model, usage ? `${formatCompact(tokensOf(usage))} tokens` : '', duration, chars]
    .filter(Boolean)
    .join(' · ');
  if (!label) return () => {};

  ensureInlineStyle();
  const span = document.createElement('span');
  span.className = 'nu-inline';
  span.textContent = label;
  element.appendChild(span);
  return () => span.remove();
};

/** 挂载会话头（session=true）入口按钮或消息尾部（session=false）纯文字 */
export const mountUsage = (element, context, session, ctx) => {
  if (!session) return mountInlineText(element, context, ctx);
  const app = createApp(SessionChip, { context, api: ctx });
  app.mount(element);
  return () => app.unmount();
};
