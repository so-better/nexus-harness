<template>
  <button
    type="button"
    class="nh-search-result"
    :class="{ 'nh-search-result--active': active }"
    @click="emit('select')"
  >
    <span class="nh-search-result__head">
      <span class="nh-search-result__role">{{ roleLabel }}</span>
      <span class="nh-search-result__session">{{ result.sessionTitle }}</span>
    </span>
    <span class="nh-search-result__snippet">
      <template v-if="result.matchStart >= 0"
        >{{ result.snippet.slice(0, result.matchStart)
        }}<mark>{{ result.snippet.slice(result.matchStart, result.matchEnd) }}</mark
        >{{ result.snippet.slice(result.matchEnd) }}</template
      >
      <template v-else>{{ result.snippet }}</template>
    </span>
  </button>
</template>

<script setup lang="ts">
/**
 * 跨会话消息搜索结果：角色、会话名与高亮片段。
 */

import { computed } from 'vue';
import type { SessionSearchResult } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';

const props = defineProps<{
  result: SessionSearchResult;
  active: boolean;
}>();

const emit = defineEmits<{ select: [] }>();

const roleLabel = computed(() =>
  props.result.role === 'user' ? t('chat.user') : t('chat.assistant')
);
</script>

<style scoped lang="less">
.nh-search-result {
  display: block;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: background var(--nh-duration-fast) var(--nh-ease-standard);
}

.nh-search-result:hover {
  background: var(--nh-color-bg-hover);
}

.nh-search-result--active {
  background: color-mix(in srgb, var(--nh-color-accent) 10%, transparent);
}

.nh-search-result:focus-visible {
  outline: 2px solid var(--nh-color-accent);
  outline-offset: -2px;
}

.nh-search-result__head {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  font-size: 12px;
}

.nh-search-result__role {
  flex: none;
  color: var(--nh-color-accent);
  font-weight: 500;
}

.nh-search-result__session {
  overflow: hidden;
  color: var(--nh-color-text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-search-result__snippet {
  display: -webkit-box;
  overflow: hidden;
  color: var(--nh-color-text-primary);
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.nh-search-result__snippet mark {
  padding: 0 1px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--nh-color-accent) 24%, transparent);
  color: inherit;
}
</style>
