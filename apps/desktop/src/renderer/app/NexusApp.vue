<template>
  <NConfigProvider :theme="theme" :theme-overrides="themeOverrides">
    <NMessageProvider>
      <MainLayout />
    </NMessageProvider>
  </NConfigProvider>
</template>

<script setup lang="ts">
/**
 * 应用根组件：注入 Naive UI 主题并承载主布局。
 */

import { computed } from 'vue';
import { darkTheme, NConfigProvider, NMessageProvider } from 'naive-ui';
import { effectiveTheme } from './theme';
import { getNaiveOverrides, getPalette } from './theme-palette';
import MainLayout from '@/layouts/MainLayout.vue';

const theme = computed(() => (effectiveTheme.value === 'dark' ? darkTheme : null));
const themeOverrides = computed(() => getNaiveOverrides(getPalette(effectiveTheme.value)));
</script>
