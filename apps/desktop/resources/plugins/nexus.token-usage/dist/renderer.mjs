/**
 * Token 用量插件：在会话标题栏和每条 AI 消息尾部显示 token 用量。
 */

const formatTokens = (value) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);

const isEnglish = () => document.documentElement.lang.toLowerCase().startsWith('en');

const usageText = (usage, session) => {
  if (!usage) return '';
  const total = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
  if (total <= 0) return '';
  const label = session ? (isEnglish() ? 'Session' : '会话') : '';
  return `${label ? `${label} ` : ''}${formatTokens(total)} tokens`;
};

const titleText = (usage) => {
  const input = usage?.inputTokens ?? 0;
  const output = usage?.outputTokens ?? 0;
  return isEnglish()
    ? `Input ${formatTokens(input)} · Output ${formatTokens(output)}`
    : `输入 ${formatTokens(input)} · 输出 ${formatTokens(output)}`;
};

const mountUsage = (element, context, session) => {
  const text = usageText(context.usage, session);
  if (!text || !context.usage) return () => undefined;
  const span = document.createElement('span');
  span.textContent = text;
  span.title = titleText(context.usage);
  const isHeader = context.location === 'session.header.actions';
  span.style.cssText = [
    'display:inline-block',
    'color:var(--nh-color-text-secondary)',
    'font-size:10px',
    'font-family:var(--nh-font-mono)',
    isHeader ? 'margin-right:4px' : 'margin-top:6px'
  ].join(';');
  element.appendChild(span);
  return () => span.remove();
};

export function activate(ctx) {
  const inlineDispose = ctx.slots.register('usage.inline', (element, context) =>
    mountUsage(element, context, false)
  );
  const sessionDispose = ctx.slots.register('usage.session', (element, context) =>
    mountUsage(element, context, true)
  );
  return () => {
    inlineDispose();
    sessionDispose();
  };
}
