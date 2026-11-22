<template>
  <NConfigProvider
    :theme="theme"
    :theme-overrides="themeOverrides"
    :locale="naiveLocale"
    :date-locale="naiveDateLocale"
  >
    <NMessageProvider>
      <NDialogProvider>
        <MainLayout />
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>

<script setup lang="ts">
/**
 * 应用根组件：注入 Naive UI 主题并承载主布局。
 */

import { computed } from 'vue';
import {
  darkTheme,
  dateEnUS,
  dateZhCN,
  enUS,
  NConfigProvider,
  NDialogProvider,
  NMessageProvider,
  zhCN
} from 'naive-ui';
import { effectiveTheme } from './theme';
import { locale } from './i18n';
import { getNaiveOverrides, getPalette } from './theme-palette';
import MainLayout from '@/layouts/MainLayout.vue';

const theme = computed(() => (effectiveTheme.value === 'dark' ? darkTheme : null));
const naiveLocale = computed(() => (locale.value === 'zh-CN' ? zhCN : enUS));
const naiveDateLocale = computed(() => (locale.value === 'zh-CN' ? dateZhCN : dateEnUS));
const themeOverrides = computed(() => getNaiveOverrides(getPalette(effectiveTheme.value)));
</script>
