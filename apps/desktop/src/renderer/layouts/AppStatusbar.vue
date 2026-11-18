<template>
  <footer class="nh-statusbar">
    <div class="nh-statusbar__meta">
      <span class="nh-statusbar__version">v{{ version }}</span>
    </div>

    <div class="nh-statusbar__actions">
      <NDropdown trigger="click" placement="top-end" :options="themeOptions" @select="selectTheme">
        <NButton text size="tiny" :aria-label="t('app.theme')" :title="t('app.theme')">
          <template #icon>
            <AppIcon :name="currentThemeIcon" :size="14" />
          </template>
          <AppIcon name="chevron-down" :size="12" />
        </NButton>
      </NDropdown>

      <NButton text size="tiny" @click="emit('open-settings')">
        <template #icon>
          <AppIcon name="settings" :size="14" />
        </template>
        {{ t('app.settings') }}
      </NButton>
    </div>
  </footer>
</template>

<script setup lang="ts">
/**
 * 状态栏：版本、主题下拉菜单与设置入口。
 */

import { computed, h } from 'vue';
import { NButton, NDropdown, type DropdownOption } from 'naive-ui';
import type { ThemeSource } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';

const props = defineProps<{
  themeSource: ThemeSource;
  version: string;
}>();

const emit = defineEmits<{
  'update-theme': [source: ThemeSource];
  'open-settings': [];
}>();

/**
 * 主题菜单项：图标、文案与选择键。
 */
const themeOptions = computed<DropdownOption[]>(() => [
  {
    key: 'system',
    label: t('settings.themeSystem'),
    icon: () => h(AppIcon, { name: 'monitor', size: 14 })
  },
  {
    key: 'light',
    label: t('settings.themeLight'),
    icon: () => h(AppIcon, { name: 'sun', size: 14 })
  },
  {
    key: 'dark',
    label: t('settings.themeDark'),
    icon: () => h(AppIcon, { name: 'moon', size: 14 })
  }
]);

/**
 * 当前主题在触发按钮上显示的图标。
 */
const currentThemeIcon = computed(() => {
  if (props.themeSource === 'system') return 'monitor' as const;
  return props.themeSource === 'light' ? ('sun' as const) : ('moon' as const);
});

/**
 * 提交主题选择；Naive UI Dropdown 会在选择后自动关闭。
 */
const selectTheme = (key: string | number): void => {
  emit('update-theme', key as ThemeSource);
};
</script>

<style scoped lang="less">
.nh-statusbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  border-top: 1px solid var(--nh-color-border);
  background: var(--nh-color-bg-elevated);
  box-shadow: var(--nh-highlight);
  font-size: 12px;
}

.nh-statusbar__meta,
.nh-statusbar__actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.nh-statusbar__version {
  color: var(--nh-color-text-secondary);
  font-family: var(--nh-font-mono);
  font-size: 12px;
}
</style>
