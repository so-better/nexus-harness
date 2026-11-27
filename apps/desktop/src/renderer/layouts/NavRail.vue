<template>
  <nav class="nh-rail" :class="{ 'nh-rail--collapsed': collapsed }" :aria-label="t('nav.label')">
    <div class="nh-rail__header">
      <div class="nh-rail__brand">
        <span class="nh-rail__mark" aria-hidden="true">
          <svg viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient
                :id="brandId('bg')"
                x1="128"
                y1="96"
                x2="896"
                y2="928"
                gradientUnits="userSpaceOnUse"
              >
                <stop stop-color="#1B2430" />
                <stop offset="0.55" stop-color="#101720" />
                <stop offset="1" stop-color="#090D13" />
              </linearGradient>
              <radialGradient
                :id="brandId('aura')"
                cx="0"
                cy="0"
                r="1"
                gradientUnits="userSpaceOnUse"
                gradientTransform="translate(512 470) rotate(90) scale(430)"
              >
                <stop stop-color="#2E6EA8" stop-opacity="0.42" />
                <stop offset="1" stop-color="#2E6EA8" stop-opacity="0" />
              </radialGradient>
              <linearGradient
                :id="brandId('mark')"
                x1="332"
                y1="312"
                x2="692"
                y2="712"
                gradientUnits="userSpaceOnUse"
              >
                <stop stop-color="#FFFFFF" />
                <stop offset="1" stop-color="#C9DEFF" />
              </linearGradient>
              <filter
                :id="brandId('glow')"
                x="180"
                y="180"
                width="664"
                height="664"
                filterUnits="userSpaceOnUse"
              >
                <feGaussianBlur stdDeviation="34" />
              </filter>
            </defs>
            <g transform="translate(72.5333 72.5333) scale(0.858333)">
              <rect
                x="32"
                y="32"
                width="960"
                height="960"
                rx="218"
                :fill="`url(#${brandId('bg')})`"
              />
              <rect
                x="32"
                y="32"
                width="960"
                height="960"
                rx="218"
                :fill="`url(#${brandId('aura')})`"
              />
              <rect
                x="34"
                y="34"
                width="956"
                height="956"
                rx="216"
                stroke="#FFFFFF"
                stroke-opacity="0.08"
                stroke-width="4"
              />
              <path
                d="M332 712V312L692 712V312"
                stroke="#7FB6FF"
                stroke-opacity="0.5"
                stroke-width="112"
                stroke-linecap="round"
                stroke-linejoin="round"
                :filter="`url(#${brandId('glow')})`"
              />
              <path
                d="M332 712V312L692 712V312"
                :stroke="`url(#${brandId('mark')})`"
                stroke-width="92"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <circle cx="332" cy="312" r="20" fill="#A9CBFF" />
              <circle cx="692" cy="712" r="20" fill="#A9CBFF" />
            </g>
          </svg>
        </span>
        <span class="nh-rail__name">{{ t('app.brand') }}</span>
      </div>
    </div>

    <div class="nh-rail__list">
      <NButton
        v-for="item in items"
        :key="item.key"
        class="nh-rail__item"
        :class="{ 'is-active': item.key === activeKey }"
        quaternary
        block
        :aria-current="item.key === activeKey ? 'page' : undefined"
        :title="item.label"
        :aria-label="item.label"
        @click="emit('select', item.key)"
      >
        <span class="nh-rail__row">
          <span class="nh-rail__icon">
            <component :is="item.icon" />
          </span>
          <span class="nh-rail__label">{{ item.label }}</span>
        </span>
      </NButton>
    </div>

    <div class="nh-rail__footer">
      <NButton
        text
        size="small"
        :title="collapsed ? t('nav.expand') : t('nav.collapseSidebar')"
        :aria-label="collapsed ? t('nav.expand') : t('nav.collapseSidebar')"
        @click="emit('toggle')"
      >
        <template #icon>
          <AppIcon :name="collapsed ? 'panel-expand' : 'panel-collapse'" :size="16" />
        </template>
        <span v-if="!collapsed">{{ t('nav.collapseSidebar') }}</span>
      </NButton>
    </div>
  </nav>
</template>

<script setup lang="ts">
/**
 * 左侧垂直导航栏：可展开/收起。
 * 顶部为应用图标（展开时带名称），中部菜单可滚动，底部为收起/展开按钮并以分隔线与菜单区分。
 */

import { useId } from 'vue';
import { NButton } from 'naive-ui';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import type { RailNavItem } from './nav-items';

defineProps<{ collapsed: boolean; items: RailNavItem[]; activeKey: string }>();
const emit = defineEmits<{ select: [key: string]; toggle: [] }>();

// 结合 useId 生成唯一 id，避免内联 SVG 的渐变/滤镜 id 在多次渲染时冲突
const uid = useId();
const brandId = (part: string): string => `nh-brand-${part}-${uid}`;
</script>

<style scoped lang="less">
.nh-rail {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  padding: 0 8px;
  border-right: 1px solid var(--nh-border-subtle);
  background: var(--nh-surface-elevated);
}

.nh-rail__header {
  display: flex;
  min-width: 0;
  flex: none;
  align-items: center;
  justify-content: center;
  margin: 0 -8px;
  padding: 8px;
  border-bottom: 1px solid var(--nh-border-subtle);
}

.nh-rail__brand {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.nh-rail--collapsed .nh-rail__brand {
  gap: 0;
}

.nh-rail__mark,
.nh-rail__mark svg {
  display: block;
  width: 36px;
  height: 36px;
  flex: none;
}

.nh-rail__name {
  max-width: 0;
  overflow: hidden;
  font-size: 16px;
  font-weight: 600;
  opacity: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition:
    max-width var(--nh-duration-base) var(--nh-ease-standard),
    opacity var(--nh-duration-base) var(--nh-ease-standard);
}

.nh-rail:not(.nh-rail--collapsed) .nh-rail__name {
  max-width: 180px;
  opacity: 1;
}

.nh-rail__list {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  padding-top: 6px;
  overflow: hidden auto;
}

.nh-rail__item {
  height: 38px;
  padding: 0 10px;
}

.nh-rail__item :deep(.n-button__content) {
  justify-content: flex-start;
  width: 100%;
}

.nh-rail--collapsed .nh-rail__item :deep(.n-button__content) {
  justify-content: center;
}

.nh-rail__row {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  gap: 10px;
  color: inherit;
}

.nh-rail--collapsed .nh-rail__row {
  justify-content: center;
  gap: 0;
}

.nh-rail__icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
}

.nh-rail__label {
  max-width: 0;
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  font-size: 13px;
  opacity: 0;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition:
    max-width var(--nh-duration-base) var(--nh-ease-standard),
    opacity var(--nh-duration-base) var(--nh-ease-standard);
}

.nh-rail:not(.nh-rail--collapsed) .nh-rail__label {
  max-width: 180px;
  opacity: 1;
}

.nh-rail__footer {
  display: flex;
  height: 44px;
  flex: none;
  align-items: center;
  justify-content: center;
  margin: 0 -8px;
  border-top: 1px solid var(--nh-border-subtle);
}

// 激活项：浅色强调底 + 强调色前景（覆盖 Naive 按钮底色，故用 !important）
.nh-rail__item.is-active {
  background-color: color-mix(in srgb, var(--nh-color-accent) 12%, transparent) !important;
  color: var(--nh-color-accent) !important;
}

@media (prefers-reduced-motion: reduce) {
  .nh-rail__name,
  .nh-rail__label {
    transition: none;
  }
}
</style>
