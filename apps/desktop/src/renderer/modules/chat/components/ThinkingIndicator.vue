<template>
  <div class="nh-thinking" role="status" :aria-label="t('chat.generating')">
    <span class="nh-thinking__cursor" aria-hidden="true" />
  </div>
</template>

<script setup lang="ts">
/**
 * AI 生成中的加载光标：不显示状态文字，只保留闪烁动画。
 */

import { t } from '@/app/i18n';
</script>

<style scoped lang="less">
.nh-thinking {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  height: 1.5em;
  padding: 4px 2px;
}

.nh-thinking__cursor {
  width: 2px;
  height: 1.1em;
  border-radius: 1px;
  background: var(--nh-color-accent);
  animation: nh-thinking-blink 1s steps(2, start) infinite;
}

@keyframes nh-thinking-blink {
  50% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .nh-thinking__cursor {
    animation: none;
    opacity: 0.6;
  }
}
</style>
