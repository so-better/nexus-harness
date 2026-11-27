/**
 * Token 用量插件：会话头/消息尾部轻量汇总，以及会话与全局用量看板。
 */

const DAY_MS = 24 * 60 * 60 * 1000;

let activeSessionId;

const isEnglish = () => document.documentElement.lang.toLowerCase().startsWith('en');

const formatNumber = (value) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value ?? 0);

const formatCompact = (value) =>
  new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value ?? 0);

const formatTime = (value) =>
  new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit' }).format(
    value
  );

const formatDuration = (ms) => `${(Math.max(0, ms) / 1000).toFixed(1)}s`;

const tokensOf = (usage) => (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);

const labels = () =>
  isEnglish()
    ? {
        usage: 'Usage',
        session: 'Session',
        all: 'All sessions',
        last7: '7 days',
        last30: '30 days',
        allTime: 'All time',
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

const create = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const openDashboard = (ctx) => {
  ctx.views.open('usage.dashboard').catch((error) => ctx.logger.error(String(error)));
};

const usageText = (usage, session, text) => {
  const total = tokensOf(usage);
  if (!usage) return session ? text.usage : '';
  return session ? `${text.usage} ${formatCompact(total)}` : `${formatCompact(total)} tokens`;
};

const titleText = (usage, text) => {
  if (!usage) return text.openDashboard;
  return `${text.input} ${formatNumber(usage.inputTokens)} · ${text.output} ${formatNumber(
    usage.outputTokens
  )}`;
};

const injectTriggerStyles = (element) => {
  const style = document.createElement('style');
  style.textContent = `
    .nh-token-usage__trigger {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 9px 4px 7px; border: 1px solid color-mix(in srgb, var(--nh-color-accent) 26%, var(--nh-border-subtle));
      border-radius: 999px;
      background: linear-gradient(135deg, color-mix(in srgb, var(--nh-color-accent) 13%, var(--nh-color-bg-elevated)), color-mix(in srgb, var(--nh-color-accent) 4%, var(--nh-color-bg-elevated)));
      box-shadow: 0 1px 0 var(--nh-highlight), 0 2px 10px color-mix(in srgb, var(--nh-color-accent) 8%, transparent);
      color: var(--nh-color-text-secondary); font-family: var(--nh-font-mono); font-size: 10px; font-weight: 500; line-height: 1.2;
      cursor: pointer; transition: border-color 160ms ease, background 160ms ease, color 160ms ease, box-shadow 160ms ease;
    }
    .nh-token-usage__trigger:hover {
      border-color: color-mix(in srgb, var(--nh-color-accent) 58%, var(--nh-border-subtle));
      background: linear-gradient(135deg, color-mix(in srgb, var(--nh-color-accent) 22%, var(--nh-color-bg-elevated)), color-mix(in srgb, var(--nh-color-accent) 8%, var(--nh-color-bg-elevated)));
      box-shadow: 0 1px 0 var(--nh-highlight), 0 4px 14px color-mix(in srgb, var(--nh-color-accent) 14%, transparent);
      color: var(--nh-color-text-primary);
    }
    .nh-token-usage__trigger:active { box-shadow: 0 1px 0 var(--nh-highlight); }
    .nh-token-usage__trigger:focus-visible { outline: 2px solid var(--nh-color-accent); outline-offset: 2px; }
    .nh-token-usage__trigger--session { margin-right: 4px; }
    .nh-token-usage__trigger:not(.nh-token-usage__trigger--session) { margin-top: 6px; padding: 2px 7px 2px 5px; border-color: transparent; background: transparent; box-shadow: none; color: var(--nh-color-text-secondary); }
    .nh-token-usage__trigger:not(.nh-token-usage__trigger--session):hover { border-color: color-mix(in srgb, var(--nh-color-accent) 22%, transparent); background: color-mix(in srgb, var(--nh-color-accent) 8%, transparent); box-shadow: none; }
    .nh-token-usage__trigger-icon { width: 13px; height: 13px; flex: none; color: var(--nh-color-accent); }
    .nh-token-usage__trigger-label { letter-spacing: .01em; }
    @media (prefers-reduced-motion: reduce) { .nh-token-usage__trigger { transition: none; } }
  `;
  element.appendChild(style);
};

const chartIcon = () => {
  const icon = svgNode('svg', {
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 1.4,
    'aria-hidden': 'true'
  });
  icon.classList.add('nh-token-usage__trigger-icon');
  icon.append(
    svgNode('path', { d: 'M2.5 13.5V2.5M2.5 13.5H14' }),
    svgNode('path', { d: 'm4.5 10 2.7-3 2.2 2 3.6-4.5' })
  );
  return icon;
};

const mountUsage = (element, context, session, ctx) => {
  if (session) activeSessionId = context.sessionId;
  const text = labels();
  const tokenValue = usageText(context.usage, session, text);
  // 耗时/字数默认关闭，由插件设置 showDuration / showChars 控制
  const showDuration = ctx.settings?.showDuration === true;
  const showChars = ctx.settings?.showChars === true;
  // 消息尾部：提供商 / 模型 + token 始终显示；耗时与字数按设置追加；会话头仍只显示 token
  const modelLabel =
    !session && (context.provider || context.model)
      ? [context.provider, context.model].filter(Boolean).join(' / ')
      : '';
  const inlineValue = [
    modelLabel,
    context.usage ? tokenValue : '',
    showDuration && typeof context.durationMs === 'number'
      ? formatDuration(context.durationMs)
      : '',
    showChars && typeof context.contentChars === 'number'
      ? `${formatNumber(context.contentChars)} ${isEnglish() ? 'chars' : '字'}`
      : ''
  ]
    .filter(Boolean)
    .join(' · ');
  const value = session ? tokenValue : inlineValue;
  if (!value) return () => undefined;

  if (!session) {
    const label = create('span', 'nh-token-usage__inline', value);
    label.style.cssText = [
      'display:inline-block',
      'margin-top:6px',
      'max-width:100%',
      'overflow-wrap:anywhere',
      'color:var(--nh-color-text-secondary)',
      'font-family:var(--nh-font-mono)',
      'font-size:10px',
      'line-height:1.2'
    ].join(';');
    element.appendChild(label);
    return () => label.remove();
  }

  injectTriggerStyles(element);
  const button = create('button', 'nh-token-usage__trigger');
  const activate = () => openDashboard(ctx);
  const icon = chartIcon();
  const label = create('span', 'nh-token-usage__trigger-label', value);
  button.type = 'button';
  button.title = `${titleText(context.usage, text)} · ${text.openDashboard}`;
  button.setAttribute('aria-label', `${titleText(context.usage, text)} · ${text.openDashboard}`);
  button.setAttribute('aria-haspopup', 'dialog');
  button.dataset.sessionId = context.sessionId ?? '';
  button.classList.toggle('nh-token-usage__trigger--session', session);
  button.append(icon, label);
  button.addEventListener('click', activate);
  element.appendChild(button);
  return () => {
    button.removeEventListener('click', activate);
    button.remove();
  };
};

/**
 * SVG 元素工厂；图表不依赖第三方库。
 */
const svgNode = (tag, attributes = {}) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, String(value));
  }
  return node;
};

const buildLineChart = (series, text) => {
  const width = 760;
  const height = 250;
  const left = 46;
  const right = 18;
  const top = 18;
  const bottom = 34;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const max = Math.max(...series.map((point) => Math.max(point.inputTokens, point.outputTokens) || 0), 1);
  const x = (index) =>
    left + (series.length <= 1 ? plotWidth / 2 : (index / (series.length - 1)) * plotWidth);
  const y = (value) => top + plotHeight - (value / max) * plotHeight;
  const points = (key) => series.map((point, index) => [x(index), y(point[key])]);
  const smoothPath = (values) => {
    if (!values.length) return '';
    if (values.length === 1) return `M ${values[0][0]} ${values[0][1]}`;
    let d = `M ${values[0][0]} ${values[0][1]}`;
    for (let index = 0; index < values.length - 1; index += 1) {
      const p0 = values[index - 1] ?? values[index];
      const p1 = values[index];
      const p2 = values[index + 1];
      const p3 = values[index + 2] ?? p2;
      const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
      const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
      const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
    }
    return d;
  };
  const path = (key) => smoothPath(points(key));
  const area = (key) => {
    if (!series.length) return '';
    return `${path(key)} L ${x(series.length - 1)} ${top + plotHeight} L ${x(0)} ${
      top + plotHeight
    } Z`;
  };

  const svg = svgNode('svg', {
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': `${text.input} / ${text.output}`
  });
  svg.classList.add('nh-token-usage__chart');

  for (let tick = 0; tick <= 4; tick += 1) {
    const tickY = top + (plotHeight / 4) * tick;
    svg.appendChild(
      svgNode('line', {
        x1: left,
        x2: width - right,
        y1: tickY,
        y2: tickY,
        class: 'nh-token-usage__grid'
      })
    );
    const label = svgNode('text', {
      x: left - 8,
      y: tickY + 4,
      'text-anchor': 'end',
      class: 'nh-token-usage__axis'
    });
    label.textContent = formatCompact(Math.round(max - (max / 4) * tick));
    svg.appendChild(label);
  }

  svg.appendChild(
    svgNode('path', {
      d: area('inputTokens'),
      class: 'nh-token-usage__area nh-token-usage__area--input'
    })
  );
  svg.appendChild(
    svgNode('path', {
      d: area('outputTokens'),
      class: 'nh-token-usage__area nh-token-usage__area--output'
    })
  );
  svg.appendChild(
    svgNode('path', {
      d: path('inputTokens'),
      class: 'nh-token-usage__line nh-token-usage__line--input'
    })
  );
  svg.appendChild(
    svgNode('path', {
      d: path('outputTokens'),
      class: 'nh-token-usage__line nh-token-usage__line--output'
    })
  );

  if (series.length <= 12) {
    for (const [key, label] of [
      ['inputTokens', text.input],
      ['outputTokens', text.output]
    ]) {
      points(key).forEach(([pointX, pointY], index) => {
        if (!series[index]) return;
        const dot = svgNode('circle', {
          cx: pointX,
          cy: pointY,
          r: 2.4,
          class: `nh-token-usage__dot nh-token-usage__dot--${key === 'inputTokens' ? 'input' : 'output'}`
        });
        const tooltip = svgNode('title');
        tooltip.textContent = `${label} · ${formatNumber(series[index][key])} tokens`;
        dot.appendChild(tooltip);
        svg.appendChild(dot);
      });
    }
  }

  const labelIndexes = series.length <= 1 ? [0] : [0, Math.floor((series.length - 1) / 2), series.length - 1];
  for (const index of [...new Set(labelIndexes)]) {
    const point = series[index];
    if (!point) continue;
    const label = svgNode('text', {
      x: x(index),
      y: height - 10,
      'text-anchor': index === 0 ? 'start' : index === series.length - 1 ? 'end' : 'middle',
      class: 'nh-token-usage__axis'
    });
    label.textContent = formatTime(point.start);
    svg.appendChild(label);
  }

  return svg;
};

const buildDonut = (rows, text) => {
  const total = rows.reduce((sum, row) => sum + row.totalTokens, 0);
  const top = rows.slice(0, 5);
  const rest = rows.slice(5);
  const display = rest.length
    ? [
        ...top,
        {
          key: 'other',
          label: text.other,
          totalTokens: rest.reduce((sum, row) => sum + row.totalTokens, 0)
        }
      ]
    : top;
  const root = create('div', 'nh-token-usage__donut-wrap');
  const svg = svgNode('svg', {
    viewBox: '0 0 120 120',
    role: 'img',
    'aria-label': text.byModel
  });
  svg.classList.add('nh-token-usage__donut');
  const radius = 43;
  const circumference = 2 * Math.PI * radius;
  svg.appendChild(
    svgNode('circle', {
      cx: 60,
      cy: 60,
      r: radius,
      class: 'nh-token-usage__donut-track'
    })
  );
  const colors = [
    'var(--nh-color-accent)',
    'var(--nh-color-idle)',
    'var(--nh-color-success)',
    'var(--nh-color-warning)',
    'var(--nh-color-danger)',
    'var(--nh-color-text-secondary)'
  ];
  let offset = 0;
  display.forEach((row, index) => {
    const length = total ? (row.totalTokens / total) * circumference : 0;
    const segment = svgNode('circle', {
      cx: 60,
      cy: 60,
      r: radius,
      class: 'nh-token-usage__donut-segment',
      'stroke-dasharray': `${length} ${circumference}`,
      'stroke-dashoffset': -offset,
      transform: 'rotate(-90 60 60)'
    });
    segment.style.stroke = colors[index % colors.length];
    svg.appendChild(segment);
    offset += length;
  });
  const value = svgNode('text', {
    x: 60,
    y: 57,
    'text-anchor': 'middle',
    class: 'nh-token-usage__donut-value'
  });
  value.textContent = formatCompact(total);
  const caption = svgNode('text', {
    x: 60,
    y: 72,
    'text-anchor': 'middle',
    class: 'nh-token-usage__donut-caption'
  });
  caption.textContent = 'tokens';
  svg.append(value, caption);

  const legend = create('div', 'nh-token-usage__legend');
  display.forEach((row, index) => {
    const item = create('div', 'nh-token-usage__legend-row');
    const dot = create('span', `nh-token-usage__legend-dot nh-token-usage__legend-dot--${index}`);
    const label = create('span', 'nh-token-usage__legend-label', row.label);
    const amount = create('strong', 'nh-token-usage__legend-value', formatCompact(row.totalTokens));
    item.append(dot, label, amount);
    legend.appendChild(item);
  });

  if (!total) {
    const empty = create('p', 'nh-token-usage__empty', text.empty);
    root.append(svg, empty);
    return root;
  }
  root.append(svg, legend);
  return root;
};

const buildSessions = (sessions, text) => {
  const root = create('section', 'nh-token-usage__sessions');
  const head = create('div', 'nh-token-usage__section-head');
  head.append(create('h3', '', text.sessions), create('span', '', `${sessions.length}`));
  root.appendChild(head);
  if (!sessions.length) {
    root.appendChild(create('p', 'nh-token-usage__empty', text.empty));
    return root;
  }
  const max = Math.max(...sessions.map((session) => session.totalTokens), 1);
  sessions.slice(0, 8).forEach((session, index) => {
    const row = create('div', 'nh-token-usage__session-row');
    const rank = create('span', 'nh-token-usage__session-rank', String(index + 1).padStart(2, '0'));
    const copy = create('div', 'nh-token-usage__session-copy');
    copy.append(
      create('strong', '', session.title),
      create(
        'span',
        '',
        `${formatNumber(session.totalTokens)} tokens · ${formatNumber(session.calls)} ${text.calls}`
      )
    );
    const bar = create('span', 'nh-token-usage__session-bar');
    const fill = create('span', 'nh-token-usage__session-fill');
    fill.style.width = `${Math.max(3, (session.totalTokens / max) * 100)}%`;
    bar.appendChild(fill);
    row.append(rank, copy, bar);
    root.appendChild(row);
  });
  return root;
};

const buildMetrics = (totals, text) => {
  const grid = create('div', 'nh-token-usage__metrics');
  const metrics = [
    [text.total, formatCompact(totals.totalTokens), formatNumber(totals.totalTokens)],
    [text.input, formatCompact(totals.inputTokens), formatNumber(totals.inputTokens)],
    [text.output, formatCompact(totals.outputTokens), formatNumber(totals.outputTokens)]
  ];
  // 缓存读/写入/命中率三张卡：只要出现缓存活动就同时展示，缺失字段按 0 显示
  const inputTokens = totals.inputTokens ?? 0;
  const cacheRead = totals.cacheReadTokens ?? 0;
  const cacheWrite = totals.cacheWriteTokens ?? 0;
  if (cacheRead || cacheWrite) {
    // 缓存命中率 = 缓存读 / 输入；inputTokens 含缓存读，两个协议口径一致
    if (cacheRead && inputTokens) {
      const rate = Math.round((cacheRead / inputTokens) * 100);
      metrics.push([
        text.cacheHit,
        `${rate}%`,
        `${formatNumber(cacheRead)} / ${formatNumber(inputTokens)}`
      ]);
    }
    metrics.push([text.cacheRead, formatCompact(cacheRead), formatNumber(cacheRead)]);
    metrics.push([text.cacheWrite, formatCompact(cacheWrite), formatNumber(cacheWrite)]);
  }
  metrics.push([text.calls, formatNumber(totals.calls), formatNumber(totals.calls)]);
  for (const [label, value, title] of metrics) {
    const card = create('article', 'nh-token-usage__metric');
    const body = create('div', 'nh-token-usage__metric-body');
    body.append(create('span', 'nh-token-usage__metric-label', label), create('strong', '', value));
    card.title = title;
    card.appendChild(body);
    grid.appendChild(card);
  }
  return grid;
};

/**
 * 构建当前会话的上下文占用区块：窗口、已用、剩余与预留输出。
 * 未知窗口时返回 null，由调用方跳过渲染。
 */
const buildContext = (context, text) => {
  const contextWindow = context.contextWindow ?? 0;
  if (!contextWindow) return null;
  const used = Math.max(0, context.contextTokens ?? 0);
  const reserved = Math.max(0, context.maxOutputTokens ?? 0);
  // 剩余可用输入 = 窗口 − 已用 − 预留输出，与上下文预算口径一致
  const remaining = Math.max(0, contextWindow - used - reserved);
  const percent = Math.min(100, Math.round((used / contextWindow) * 100));
  const panel = create('section', 'nh-token-usage__panel nh-token-usage__context');
  if (context.modelId) panel.title = context.modelId;
  const head = create('div', 'nh-token-usage__panel-head');
  head.append(create('h3', '', text.context), create('span', '', `${percent}%`));
  panel.appendChild(head);
  const bar = create('div', 'nh-token-usage__context-bar');
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-label', text.context);
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', String(contextWindow));
  bar.setAttribute('aria-valuenow', String(Math.min(used, contextWindow)));
  const fill = create('span', 'nh-token-usage__context-fill');
  // 按占用比例提示压力：>=90% 危险，>=70% 警告
  if (percent >= 90) fill.classList.add('nh-token-usage__context-fill--danger');
  else if (percent >= 70) fill.classList.add('nh-token-usage__context-fill--warn');
  fill.style.width = `${Math.max(1, percent)}%`;
  bar.appendChild(fill);
  const metrics = create('div', 'nh-token-usage__context-metrics');
  for (const [label, value, title] of [
    [text.contextUsed, formatCompact(used), formatNumber(used)],
    [text.contextRemaining, formatCompact(remaining), formatNumber(remaining)],
    [text.contextWindow, formatCompact(contextWindow), formatNumber(contextWindow)],
    [text.reservedOutput, formatCompact(reserved), formatNumber(reserved)]
  ]) {
    const item = create('div', 'nh-token-usage__context-metric');
    item.append(create('span', '', label), create('strong', '', value));
    item.title = title;
    metrics.appendChild(item);
  }
  panel.append(bar, metrics);

  // 上下文构成：系统提示 / 工具 schema / 历史消息；按真实「已用」归一，三项之和 = 已用
  const breakdown = context.breakdown;
  const breakdownTotal = breakdown
    ? breakdown.systemTokens + breakdown.toolsTokens + breakdown.historyTokens
    : 0;
  if (breakdown && breakdownTotal > 0) {
    const scale = used > 0 ? used / breakdownTotal : 1;
    const wrap = create('div', 'nh-token-usage__breakdown');
    wrap.appendChild(create('span', 'nh-token-usage__breakdown-title', text.breakdown));
    for (const [label, raw] of [
      [text.breakdownSystem, breakdown.systemTokens],
      [text.breakdownTools, breakdown.toolsTokens],
      [text.breakdownHistory, breakdown.historyTokens]
    ]) {
      const percent = (raw / breakdownTotal) * 100;
      const row = create('div', 'nh-token-usage__breakdown-row');
      const head = create('div', 'nh-token-usage__breakdown-head');
      head.append(
        create('span', '', label),
        create('strong', '', `${formatCompact(Math.round(raw * scale))} · ${Math.round(percent)}%`)
      );
      const track = create('div', 'nh-token-usage__breakdown-track');
      const fill = create('span', 'nh-token-usage__breakdown-fill');
      fill.style.width = `${Math.max(2, percent)}%`;
      track.appendChild(fill);
      row.append(head, track);
      wrap.appendChild(row);
    }
    panel.appendChild(wrap);
  }
  return panel;
};

const injectStyles = (element) => {
  const style = document.createElement('style');
  style.textContent = `
    .nh-token-usage__trigger {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 8px 3px 6px;
      border: 1px solid color-mix(in srgb, var(--nh-border-subtle) 78%, transparent);
      border-radius: 999px;
      background: color-mix(in srgb, var(--nh-color-bg-elevated) 56%, transparent);
      color: var(--nh-color-text-secondary);
      font-family: var(--nh-font-mono);
      font-size: 10px;
      line-height: 1.2;
      cursor: pointer;
      transition: border-color 160ms ease, background 160ms ease, color 160ms ease;
    }
    .nh-token-usage__trigger:hover {
      border-color: color-mix(in srgb, var(--nh-color-accent) 48%, var(--nh-border-subtle));
      background: color-mix(in srgb, var(--nh-color-accent) 11%, var(--nh-color-bg-elevated));
      color: var(--nh-color-text-primary);
    }
    .nh-token-usage__trigger:active {}
    .nh-token-usage__trigger:focus-visible { outline: 2px solid var(--nh-color-accent); outline-offset: 2px; }
    .nh-token-usage__trigger--session { margin-right: 4px; }
    .nh-token-usage__trigger:not(.nh-token-usage__trigger--session) { margin-top: 6px; }
    .nh-token-usage__trigger-icon { width: 12px; height: 12px; flex: none; opacity: .9; }
    @media (prefers-reduced-motion: reduce) { .nh-token-usage__trigger { transition: none; } }
    .nh-token-usage__dashboard {
      --usage-card: color-mix(in srgb, var(--nh-color-bg-elevated) 62%, transparent);
      display: flex;
      flex-direction: column;
      gap: 20px;
      min-height: 420px;
      color: var(--nh-color-text-primary);
    }
    .nh-token-usage__content {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .nh-token-usage__toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid var(--nh-border-subtle);
    }
    .nh-token-usage__spacer { flex: 1; }
    .nh-token-usage__button {
      padding: 5px 10px;
      border: 1px solid var(--nh-border-subtle);
      border-radius: 7px;
      background: transparent;
      color: var(--nh-color-text-secondary);
      font: inherit;
      font-size: 12px;
      cursor: pointer;
    }
    .nh-token-usage__button:hover { background: var(--nh-color-bg-hover); color: var(--nh-color-text-primary); }
    .nh-token-usage__button.is-active {
      border-color: color-mix(in srgb, var(--nh-color-accent) 42%, var(--nh-border-subtle));
      background: color-mix(in srgb, var(--nh-color-accent) 12%, transparent);
      color: var(--nh-color-text-primary);
    }
    .nh-token-usage__button:disabled { cursor: not-allowed; opacity: .42; }
    .nh-token-usage__segment {
      display: inline-flex;
      gap: 3px;
      padding: 3px;
      border: 1px solid var(--nh-border-subtle);
      border-radius: 10px;
      background: color-mix(in srgb, var(--nh-color-bg-base) 48%, transparent);
      box-shadow: inset 0 1px 2px color-mix(in srgb, var(--nh-color-bg-base) 34%, transparent);
    }
    .nh-token-usage__segment--scope { min-width: 250px; }
    .nh-token-usage__segment--range { min-width: 300px; }
    .nh-token-usage__segment .nh-token-usage__button {
      flex: 1;
      min-width: 0;
      padding: 6px 12px;
      border: 0;
      border-radius: 7px;
      background: transparent;
      color: var(--nh-color-text-secondary);
      text-align: center;
      white-space: nowrap;
      transition: background 160ms ease, color 160ms ease, box-shadow 160ms ease;
    }
    .nh-token-usage__segment .nh-token-usage__button:hover:not(.is-active) {
      background: color-mix(in srgb, var(--nh-color-accent) 9%, transparent);
      color: var(--nh-color-text-primary);
    }
    .nh-token-usage__segment .nh-token-usage__button.is-active {
      border: 0;
      background: var(--nh-color-accent);
      box-shadow: 0 2px 8px color-mix(in srgb, var(--nh-color-accent) 32%, transparent);
      color: var(--nh-color-bg-base);
      font-weight: 600;
    }
    .nh-token-usage__hero {
      position: relative;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 18px;
      overflow: hidden;
      padding: 18px 20px;
      border: 1px solid color-mix(in srgb, var(--nh-color-accent) 22%, var(--nh-border-subtle));
      border-radius: 12px;
      background: linear-gradient(135deg, color-mix(in srgb, var(--nh-color-accent) 10%, var(--usage-card)), var(--usage-card));
    }
    .nh-token-usage__hero::after {
      position: absolute;
      top: -80px;
      right: -40px;
      width: 260px;
      height: 220px;
      border-radius: 50%;
      background: radial-gradient(circle, color-mix(in srgb, var(--nh-color-idle) 22%, transparent), transparent 68%);
      content: '';
      pointer-events: none;
    }
    .nh-token-usage__hero-copy { position: relative; z-index: 1; display: flex; min-width: 0; flex-direction: column; gap: 3px; }
    .nh-token-usage__eyebrow { color: var(--nh-color-text-secondary); font-size: 11px; letter-spacing: .04em; }
    .nh-token-usage__hero-value { font-size: 30px; font-weight: 680; letter-spacing: .04em; line-height: 1.1; font-variant-numeric: tabular-nums; }
    .nh-token-usage__hero-sub { color: var(--nh-color-text-secondary); font-size: 11px; }
    .nh-token-usage__hero-stat { position: relative; z-index: 1; display: flex; align-items: baseline; gap: 5px; color: var(--nh-color-text-secondary); font-size: 11px; }
    .nh-token-usage__hero-stat strong { color: var(--nh-color-text-primary); font-family: var(--nh-font-mono); font-size: 20px; font-weight: 600; letter-spacing: .02em; font-variant-numeric: tabular-nums; }
    .nh-token-usage__metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 20px;
    }
    .nh-token-usage__metric {
      min-width: 0;
      padding: 14px;
      border: 1px solid var(--nh-border-subtle);
      border-radius: 10px;
      background: var(--usage-card);
    }
    .nh-token-usage__metric-label { display: block; color: var(--nh-color-text-secondary); font-size: 11px; }
    .nh-token-usage__metric strong { display: block; margin-top: 5px; font-size: 20px; font-weight: 650; letter-spacing: .04em; font-variant-numeric: tabular-nums; }
    .nh-token-usage__context-bar { height: 8px; overflow: hidden; border-radius: 6px; background: color-mix(in srgb, var(--nh-color-border) 45%, transparent); }
    .nh-token-usage__context-fill { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--nh-color-accent), var(--nh-color-idle)); transition: width 200ms ease; }
    .nh-token-usage__context-fill--warn { background: linear-gradient(90deg, var(--nh-color-warning), var(--nh-color-danger)); }
    .nh-token-usage__context-fill--danger { background: var(--nh-color-danger); }
    .nh-token-usage__context-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 12px; margin-top: 12px; }
    .nh-token-usage__context-metric { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
    .nh-token-usage__context-metric span { color: var(--nh-color-text-secondary); font-size: 11px; }
    .nh-token-usage__context-metric strong { font-family: var(--nh-font-mono); font-size: 16px; font-weight: 600; letter-spacing: .03em; font-variant-numeric: tabular-nums; }
    .nh-token-usage__breakdown { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }
    .nh-token-usage__breakdown-title { color: var(--nh-color-text-secondary); font-size: 11px; }
    .nh-token-usage__breakdown-row { display: flex; flex-direction: column; gap: 4px; }
    .nh-token-usage__breakdown-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; color: var(--nh-color-text-secondary); font-size: 11px; }
    .nh-token-usage__breakdown-head strong { color: var(--nh-color-text-primary); font-family: var(--nh-font-mono); font-weight: 600; letter-spacing: .03em; font-variant-numeric: tabular-nums; }
    .nh-token-usage__breakdown-track { height: 5px; overflow: hidden; border-radius: 4px; background: color-mix(in srgb, var(--nh-color-border) 45%, transparent); }
    .nh-token-usage__breakdown-fill { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--nh-color-accent), var(--nh-color-idle)); transition: width 200ms ease; }
    .nh-token-usage__grid { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(260px, .8fr); gap: 18px; }
    .nh-token-usage__grid-stack { display: flex; min-width: 0; flex-direction: column; gap: 18px; }
    .nh-token-usage__panel {
      min-width: 0;
      padding: 14px;
      border: 1px solid var(--nh-border-subtle);
      border-radius: 10px;
      background: var(--usage-card);
    }
    .nh-token-usage__panel-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
    .nh-token-usage__panel-head h3, .nh-token-usage__section-head h3 { margin: 0; font-size: 13px; font-weight: 600; }
    .nh-token-usage__panel-head span, .nh-token-usage__section-head span { color: var(--nh-color-text-secondary); font-size: 11px; }
    .nh-token-usage__chart { display: block; width: 100%; height: auto; overflow: visible; }
    .nh-token-usage__grid-line, .nh-token-usage__grid { stroke: color-mix(in srgb, var(--nh-color-border) 50%, transparent); stroke-width: 1; }
    .nh-token-usage__axis { fill: var(--nh-color-text-secondary); font-family: var(--nh-font-mono); font-size: 10px; }
    .nh-token-usage__line { fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .nh-token-usage__line--input { stroke: var(--nh-color-accent); }
    .nh-token-usage__line--output { stroke: var(--nh-color-idle); }
    .nh-token-usage__area--input { fill: color-mix(in srgb, var(--nh-color-accent) 15%, transparent); }
    .nh-token-usage__area--output { fill: color-mix(in srgb, var(--nh-color-idle) 12%, transparent); }
    .nh-token-usage__legend-inline { display: flex; gap: 12px; margin-top: 2px; color: var(--nh-color-text-secondary); font-size: 11px; }
    .nh-token-usage__legend-inline i { display: inline-block; width: 8px; height: 8px; margin-right: 4px; border-radius: 50%; }
    .nh-token-usage__legend-inline i:first-child { background: var(--nh-color-accent); }
    .nh-token-usage__legend-inline i:last-child { background: var(--nh-color-idle); }
    .nh-token-usage__donut-wrap { display: flex; align-items: center; gap: 12px; min-height: 180px; }
    .nh-token-usage__donut { width: 142px; flex: none; }
    .nh-token-usage__donut-track { fill: none; stroke: color-mix(in srgb, var(--nh-color-border) 45%, transparent); stroke-width: 12; }
    .nh-token-usage__donut-segment { fill: none; stroke-width: 12; stroke-linecap: butt; }
    .nh-token-usage__donut-segment:nth-of-type(6n+1) { stroke: var(--nh-color-accent); }
    .nh-token-usage__donut-segment:nth-of-type(6n+2) { stroke: var(--nh-color-idle); }
    .nh-token-usage__donut-segment:nth-of-type(6n+3) { stroke: var(--nh-color-success); }
    .nh-token-usage__donut-segment:nth-of-type(6n+4) { stroke: var(--nh-color-warning); }
    .nh-token-usage__donut-segment:nth-of-type(6n+5) { stroke: var(--nh-color-danger); }
    .nh-token-usage__donut-segment:nth-of-type(6n) { stroke: var(--nh-color-text-secondary); }
    .nh-token-usage__donut-value { fill: var(--nh-color-text-primary); font-size: 18px; font-weight: 650; letter-spacing: .04em; font-variant-numeric: tabular-nums; }
    .nh-token-usage__donut-caption { fill: var(--nh-color-text-secondary); font-size: 9px; }
    .nh-token-usage__legend { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 7px; }
    .nh-token-usage__legend-row { display: flex; min-width: 0; align-items: center; gap: 6px; color: var(--nh-color-text-secondary); font-size: 11px; }
    .nh-token-usage__legend-dot { width: 7px; height: 7px; flex: none; border-radius: 50%; background: var(--nh-color-accent); }
    .nh-token-usage__legend-dot--0 { background: var(--nh-color-accent); }
    .nh-token-usage__legend-dot--1 { background: var(--nh-color-idle); }
    .nh-token-usage__legend-dot--2 { background: var(--nh-color-success); }
    .nh-token-usage__legend-dot--3 { background: var(--nh-color-warning); }
    .nh-token-usage__legend-dot--4 { background: var(--nh-color-danger); }
    .nh-token-usage__legend-dot--5 { background: var(--nh-color-text-secondary); }
    .nh-token-usage__legend-label { overflow: hidden; flex: 1; text-overflow: ellipsis; white-space: nowrap; }
    .nh-token-usage__legend-value { color: var(--nh-color-text-primary); font-family: var(--nh-font-mono); font-weight: 500; letter-spacing: .03em; font-variant-numeric: tabular-nums; }
    .nh-token-usage__section-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px; }
    .nh-token-usage__session-row { display: grid; grid-template-columns: 20px minmax(0, 1fr) 100px; align-items: center; gap: 10px; padding: 7px 0; border-top: 1px solid color-mix(in srgb, var(--nh-border-subtle) 60%, transparent); }
    .nh-token-usage__session-row:first-of-type { border-top: 0; }
    .nh-token-usage__session-rank { color: var(--nh-color-text-disabled); font-family: var(--nh-font-mono); font-size: 10px; }
    .nh-token-usage__session-copy { display: flex; min-width: 0; flex-direction: column; gap: 2px; }
    .nh-token-usage__session-copy strong { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
    .nh-token-usage__session-copy span { color: var(--nh-color-text-secondary); font-size: 10px; letter-spacing: .01em; font-variant-numeric: tabular-nums; }
    .nh-token-usage__session-bar { display: block; height: 4px; overflow: hidden; border-radius: 4px; background: color-mix(in srgb, var(--nh-color-border) 40%, transparent); }
    .nh-token-usage__session-fill { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--nh-color-accent), var(--nh-color-idle)); }
    .nh-token-usage__dot { stroke: var(--nh-color-bg-base); stroke-width: 1.2; }
    .nh-token-usage__dot--input { fill: var(--nh-color-accent); }
    .nh-token-usage__dot--output { fill: var(--nh-color-idle); }
    .nh-token-usage__empty { display: grid; min-height: 150px; place-content: center; color: var(--nh-color-text-secondary); font-size: 12px; }
    .nh-token-usage__loading { opacity: .45; pointer-events: none; }
    .nh-token-usage__error { padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--nh-color-danger) 35%, var(--nh-border-subtle)); border-radius: 8px; color: var(--nh-color-danger); font-size: 12px; }
    @media (max-width: 760px) {
      .nh-token-usage__metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .nh-token-usage__grid { grid-template-columns: 1fr; }
      .nh-token-usage__segment--scope, .nh-token-usage__segment--range { min-width: 0; flex: 1; }
      .nh-token-usage__spacer { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      .nh-token-usage__dashboard, .nh-token-usage__button { transition: none; }
    }
  `;
  element.appendChild(style);
};

const mountDashboard = (element, ctx) => {
  injectStyles(element);
  const text = labels();
  const root = create('div', 'nh-token-usage__dashboard nh-token-usage__loading');
  const toolbar = create('div', 'nh-token-usage__toolbar');
  const scopeSession = create('button', 'nh-token-usage__button', text.session);
  const scopeAll = create('button', 'nh-token-usage__button', text.all);
  const range7 = create('button', 'nh-token-usage__button', text.last7);
  const range30 = create('button', 'nh-token-usage__button', text.last30);
  const rangeAll = create('button', 'nh-token-usage__button', text.allTime);
  const scopeGroup = create('div', 'nh-token-usage__segment nh-token-usage__segment--scope');
  const rangeGroup = create('div', 'nh-token-usage__segment nh-token-usage__segment--range');
  const spacer = create('span', 'nh-token-usage__spacer');
  scopeGroup.setAttribute('role', 'tablist');
  rangeGroup.setAttribute('role', 'tablist');
  scopeSession.setAttribute('role', 'tab');
  scopeAll.setAttribute('role', 'tab');
  range7.setAttribute('role', 'tab');
  range30.setAttribute('role', 'tab');
  rangeAll.setAttribute('role', 'tab');
  scopeGroup.append(scopeSession, scopeAll);
  rangeGroup.append(range7, range30, rangeAll);
  toolbar.append(scopeGroup, spacer, rangeGroup);

  const content = create('div', 'nh-token-usage__content');
  root.append(toolbar, content);
  element.appendChild(root);

  const state = {
    scope: activeSessionId ? 'session' : 'all',
    days: 30
  };
  let request = 0;
  let timer;
  let disposed = false;

  const setActive = () => {
    scopeSession.classList.toggle('is-active', state.scope === 'session');
    scopeAll.classList.toggle('is-active', state.scope === 'all');
    scopeSession.disabled = !activeSessionId;
    scopeSession.setAttribute('aria-selected', String(state.scope === 'session'));
    scopeAll.setAttribute('aria-selected', String(state.scope === 'all'));
    range7.classList.toggle('is-active', state.days === 7);
    range30.classList.toggle('is-active', state.days === 30);
    rangeAll.classList.toggle('is-active', state.days === 0);
    range7.setAttribute('aria-selected', String(state.days === 7));
    range30.setAttribute('aria-selected', String(state.days === 30));
    rangeAll.setAttribute('aria-selected', String(state.days === 0));
  };

  const render = (stats) => {
    content.replaceChildren();
    if (!stats.totals.calls) {
      content.appendChild(create('p', 'nh-token-usage__empty', text.empty));
      return;
    }

    const hero = create('section', 'nh-token-usage__hero');
    const heroCopy = create('div', 'nh-token-usage__hero-copy');
    const rangeLabel = state.days === 7 ? text.last7 : state.days === 30 ? text.last30 : text.allTime;
    heroCopy.append(
      create('span', 'nh-token-usage__eyebrow', text.usage),
      create('strong', 'nh-token-usage__hero-value', `${formatNumber(stats.totals.totalTokens)} tokens`),
      create(
        'span',
        'nh-token-usage__hero-sub',
        `${state.scope === 'session' ? text.session : text.all} · ${rangeLabel}`
      )
    );
    const heroStat = create('div', 'nh-token-usage__hero-stat');
    heroStat.append(
      create('strong', '', formatNumber(stats.totals.calls)),
      create('span', '', text.calls)
    );
    hero.append(heroCopy, heroStat);
    content.appendChild(hero);
    content.appendChild(buildMetrics(stats.totals, text));
    // 上下文占用仅当前会话有意义，缺失模型配置时 stats.context 不存在
    if (state.scope === 'session' && stats.context) {
      const contextBlock = buildContext(stats.context, text);
      if (contextBlock) content.appendChild(contextBlock);
    }

    const grid = create('div', 'nh-token-usage__grid');
    const chartPanel = create('section', 'nh-token-usage__panel');
    const chartHead = create('div', 'nh-token-usage__panel-head');
    chartHead.append(create('h3', '', state.scope === 'session' ? text.session : text.all));
    const legend = create('div', 'nh-token-usage__legend-inline');
    const inputLegend = create('span');
    const outputLegend = create('span');
    inputLegend.append(create('i'), document.createTextNode(text.input));
    outputLegend.append(create('i'), document.createTextNode(text.output));
    legend.append(inputLegend, outputLegend);
    chartHead.appendChild(legend);
    chartPanel.append(chartHead, buildLineChart(stats.series, text));

    const side = create('div', 'nh-token-usage__grid-stack');
    const donutPanel = create('section', 'nh-token-usage__panel');
    const donutHead = create('div', 'nh-token-usage__panel-head');
    donutHead.append(create('h3', '', text.byModel), create('span', '', `${stats.models.length}`));
    donutPanel.append(donutHead, buildDonut(stats.models, text));

    side.append(donutPanel);
    if (state.scope === 'all') {
      const sessionsPanel = create('section', 'nh-token-usage__panel');
      sessionsPanel.appendChild(buildSessions(stats.sessions, text));
      side.append(sessionsPanel);
    }
    grid.append(chartPanel, side);
    content.appendChild(grid);
  };

  const refreshStats = async () => {
    const current = ++request;
    const from = state.days ? Date.now() - state.days * DAY_MS : undefined;
    const query = {
      ...(state.scope === 'session' && activeSessionId ? { sessionId: activeSessionId } : {}),
      ...(from ? { from } : {}),
      bucket: state.scope === 'session' ? 'run' : 'day'
    };
    root.classList.add('nh-token-usage__loading');
    try {
      const stats = await ctx.usage.getStats(query);
      if (disposed || current !== request) return;
      render(stats);
    } catch (error) {
      if (disposed || current !== request) return;
      content.replaceChildren(create('p', 'nh-token-usage__error', text.failed));
      ctx.logger.error(String(error));
    } finally {
      if (!disposed && current === request) root.classList.remove('nh-token-usage__loading');
    }
  };

  const change = (next) => {
    if (next.scope !== undefined) state.scope = next.scope;
    if (next.days !== undefined) state.days = next.days;
    setActive();
    refreshStats();
  };

  scopeSession.addEventListener('click', () => {
    if (activeSessionId) change({ scope: 'session' });
  });
  scopeAll.addEventListener('click', () => change({ scope: 'all' }));
  range7.addEventListener('click', () => change({ days: 7 }));
  range30.addEventListener('click', () => change({ days: 30 }));
  rangeAll.addEventListener('click', () => change({ days: 0 }));

  const scheduleRefresh = () => {
    clearTimeout(timer);
    timer = setTimeout(refreshStats, 500);
  };
  const unsubscribeUsage = ctx.events.on('usage.recorded', scheduleRefresh);
  // 删除会话会改变聚合统计（deleted_at 过滤），需要刷新看板
  const unsubscribeRemoved = ctx.events.on('session.removed', scheduleRefresh);

  setActive();
  refreshStats();

  return () => {
    disposed = true;
    clearTimeout(timer);
    unsubscribeUsage();
    unsubscribeRemoved();
    root.remove();
  };
};

export function activate(ctx) {
  const inlineDispose = ctx.slots.register('usage.inline', (element, context) =>
    mountUsage(element, context, false, ctx)
  );
  const sessionDispose = ctx.slots.register('usage.session', (element, context) =>
    mountUsage(element, context, true, ctx)
  );
  const viewDispose = ctx.views.register('usage.dashboard', (element) => mountDashboard(element, ctx));
  return () => {
    inlineDispose();
    sessionDispose();
    viewDispose();
  };
}
