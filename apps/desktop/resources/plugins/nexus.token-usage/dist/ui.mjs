/**
 * 插件视图与宿主统一的 UI 外壳：复用 nexus/theme 的调色板与 Naive 覆盖，
 * 并注入命名空间 .nu-* 基础样式（卡片化布局）。
 */

import { h, onBeforeUnmount, onMounted, ref } from 'nexus/vue';
import { NConfigProvider, darkTheme, enUS, zhCN } from 'nexus/naive-ui';
import { getPalette } from 'nexus/theme';

/** 跟随 <html data-theme> 的响应式模式 */
export const useThemeMode = () => {
  const mode = ref(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  const observer = new MutationObserver(() => {
    mode.value = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  });
  onMounted(() =>
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  );
  onBeforeUnmount(() => observer.disconnect());
  return mode;
};

/** 由调色板派生 Naive 覆盖：只用具体色值（不含 var()），避免 seemly 解析报错 */
const overrides = (mode) => {
  const p = getPalette(mode);
  return {
    common: {
      primaryColor: p.accent,
      primaryColorHover: p.accentHover,
      primaryColorPressed: p.accentPressed,
      primaryColorSuppl: p.accentHover,
      borderRadius: '10px',
      borderRadiusSmall: '6px',
      textColorBase: p.textPrimary,
      textColor1: p.textPrimary,
      textColor2: p.textPrimary,
      textColor3: p.textSecondary,
      textColorDisabled: p.textDisabled,
      successColor: p.success,
      warningColor: p.warning,
      errorColor: p.danger,
      infoColor: p.accent
    },
    Card: {
      borderRadius: '14px',
      color: 'transparent',
      borderColor: p.border,
      titleFontSizeSmall: '13px',
      titleFontWeight: '600'
    },
    Button: { borderRadiusMedium: '10px', borderRadiusSmall: '8px' }
  };
};

/** 用宿主主题包裹内容（NConfigProvider + 覆盖 + locale） */
export const provide = (mode, en, children) =>
  h(
    NConfigProvider,
    {
      theme: mode.value === 'dark' ? darkTheme : null,
      themeOverrides: overrides(mode.value),
      locale: en ? enUS : zhCN
    },
    children
  );

/** 注入插件基础样式（命名空间 .nu-*；插件为 shadowDom:false，样式全局但已加前缀） */
export const ensureBaseStyles = () => {
  if (document.getElementById('nexus-token-usage-base')) return;
  const style = document.createElement('style');
  style.id = 'nexus-token-usage-base';
  style.textContent = `
    .nu-page { box-sizing: border-box; max-width: 1160px; margin: 0 auto; padding: 28px 32px 52px; display: flex; flex-direction: column; gap: 24px; }
    .nu-dashboard { display: flex; flex-direction: column; gap: 22px; min-width: 720px; }
    .nu-stack { display: flex; flex-direction: column; gap: 20px; }
    .nu-toolbar { display: flex; align-items: center; gap: 12px 20px; flex-wrap: wrap; }
    .nu-toolbar__label { color: var(--nh-color-text-secondary); font-size: 12px; }
    .nu-field { display: flex; align-items: center; gap: 8px; }

    .nu-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
    .nu-title { font-size: 22px; font-weight: 600; letter-spacing: .01em; }
    .nu-sub { margin-top: 6px; color: var(--nh-color-text-secondary); font-size: 13px; }

    .nu-hero { display: flex; align-items: center; justify-content: space-between; gap: 28px; padding: 22px 26px; border-radius: 16px; border: 1px solid var(--nh-border-subtle); background: color-mix(in srgb, var(--nh-color-accent) 7%, var(--nh-color-bg-elevated)); }
    .nu-hero__copy { display: flex; flex-direction: column; gap: 8px; }
    .nu-hero__eyebrow { color: var(--nh-color-text-secondary); font-size: 12px; letter-spacing: .06em; text-transform: uppercase; }
    .nu-hero__value { color: var(--nh-color-accent); font-size: 34px; font-weight: 700; line-height: 1.15; font-variant-numeric: tabular-nums; }
    .nu-hero__sub { color: var(--nh-color-text-secondary); font-size: 13px; }
    .nu-hero__side { display: flex; align-items: center; gap: 28px; }
    .nu-hero__stat { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
    .nu-hero__stat strong { font-size: 24px; font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums; }
    .nu-hero__stat span { color: var(--nh-color-text-secondary); font-size: 13px; }

    .nu-stat { height: 100%; }
    .nu-stat .n-card__content { display: flex; flex-direction: column; gap: 8px; padding: 16px 18px !important; }
    .nu-stat__label { color: var(--nh-color-text-secondary); font-size: 13px; }
    .nu-stat__value { display: flex; align-items: baseline; gap: 3px; color: var(--nh-color-text-primary); font-size: 24px; font-weight: 700; line-height: 1.25; font-variant-numeric: tabular-nums; }
    .nu-stat__suffix { font-size: 14px; font-weight: 600; opacity: .8; }

    .nu-ctx__head { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; }
    .nu-ctx__big { font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.2; }
    .nu-ctx__meta { color: var(--nh-color-text-secondary); font-size: 13px; font-variant-numeric: tabular-nums; }

    @media (prefers-reduced-motion: reduce) { .nu-page * { transition: none !important; } }
  `;
  document.head.appendChild(style);
};
