<template>
  <div
    class="nh-search-result"
    role="button"
    tabindex="0"
    @click="emit('select')"
    @keydown.enter="emit('select')"
    @keydown.space.prevent="emit('select')"
  >
    <span class="nh-search-result__icon">
      <AppIcon name="message" :size="14" />
    </span>
    <div class="nh-search-result__body">
      <p class="nh-search-result__title">{{ result.title }}</p>
      <p v-if="result.snippet" class="nh-search-result__snippet">{{ result.snippet }}</p>
      <p v-else class="nh-search-result__kind">{{ t('search.titleMatch') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 跨会话搜索结果：标题、消息片段与打开入口。
 */

import type { SessionSearchResult } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';

defineProps<{ result: SessionSearchResult }>();

const emit = defineEmits<{ select: [] }>();
</script>

<style scoped lang="less">
.nh-search-result {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 10px 8px;
  border-radius: 6px;
  cursor: pointer;
}

.nh-search-result:hover {
  background: var(--nh-color-bg-hover);
}

.nh-search-result:focus-visible {
  outline: 2px solid var(--nh-color-accent);
  outline-offset: -2px;
}

.nh-search-result__icon {
  display: grid;
  width: 24px;
  height: 24px;
  flex: none;
  place-items: center;
  border-radius: 6px;
  background: var(--nh-color-bg-hover);
  color: var(--nh-color-text-secondary);
}

.nh-search-result__body {
  min-width: 0;
  flex: 1;
}

.nh-search-result__title,
.nh-search-result__snippet,
.nh-search-result__kind {
  margin: 0;
}

.nh-search-result__title {
  overflow: hidden;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-search-result__snippet,
.nh-search-result__kind {
  margin-top: 2px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.nh-search-result__snippet {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.nh-search-result__kind {
  color: var(--nh-color-text-disabled);
}
</style>
