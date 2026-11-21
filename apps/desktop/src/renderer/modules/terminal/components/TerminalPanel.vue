<template>
  <NConfigProvider abstract :theme="darkTheme" :theme-overrides="terminalThemeOverrides">
    <NMessageProvider>
      <TerminalPanelContent :session-id="sessionId" :shortcut-enabled="shortcutEnabled" />
    </NMessageProvider>
  </NConfigProvider>
</template>

<script setup lang="ts">
/**
 * 终端面板宿主：强制终端视图内所有 Naive UI 组件使用深色主题。
 */
import { darkTheme, NConfigProvider, NMessageProvider } from 'naive-ui';
import { terminalThemeOverrides } from '../terminal-theme';
import TerminalPanelContent from './TerminalPanelContent.vue';

defineProps<{
  sessionId?: string | undefined;
  shortcutEnabled?: boolean;
}>();
</script>
