<template>
  <footer class="nh-statusbar">
    <span>{{ t('app.status') }}: {{ running ? t('app.running') : t('app.idle') }}</span>
    <span>{{ totalTokens }} tokens</span>
  </footer>
</template>

<script setup lang="ts">
/**
 * 状态栏：展示运行状态与累计 token。
 */

import { computed } from 'vue';
import { t } from '@/app/i18n';

const props = defineProps<{
  running: boolean;
  inputTokens: number;
  outputTokens: number;
}>();

const totalTokens = computed(() => props.inputTokens + props.outputTokens);
</script>

<style scoped lang="less">
.nh-statusbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-top: 1px solid var(--nh-color-border);
  background: var(--nh-color-bg-elevated);
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}
</style>
