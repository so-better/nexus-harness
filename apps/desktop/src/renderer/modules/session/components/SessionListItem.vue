<template>
  <div
    class="nh-session-item"
    :class="{ 'nh-session-item--active': active }"
    role="button"
    tabindex="0"
    :aria-current="active ? 'page' : undefined"
    @click="emit('select')"
    @keydown.enter="emit('select')"
    @keydown.space.prevent="emit('select')"
  >
    <span class="nh-session-item__dot" :class="`nh-session-item__dot--${session.status}`" />
    <span class="nh-session-item__body">
      <span class="nh-session-item__title-row">
        <span class="nh-session-item__title">{{ session.title }}</span>
        <NTag v-if="session.pinned" size="tiny" type="info" :bordered="false">
          {{ t('session.pin') }}
        </NTag>
      </span>
      <span class="nh-session-item__meta">{{ statusLabel }}</span>
    </span>
    <span class="nh-session-item__actions">
      <NButton
        text
        size="tiny"
        :aria-label="session.pinned ? t('session.unpin') : t('session.pin')"
        @click.stop="emit('toggle-pin')"
      >
        {{ session.pinned ? t('session.unpin') : t('session.pin') }}
      </NButton>
      <NButton text size="tiny" :aria-label="t('session.delete')" @click.stop="emit('remove')">
        {{ t('session.delete') }}
      </NButton>
    </span>
  </div>
</template>

<script setup lang="ts">
/**
 * 会话列表项：只负责展示与发出操作事件。
 */

import { computed } from 'vue';
import { NButton, NTag } from 'naive-ui';
import type { SessionSummary } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';

const props = defineProps<{
  session: SessionSummary;
  active: boolean;
}>();

const emit = defineEmits<{
  select: [];
  remove: [];
  'toggle-pin': [];
}>();

/**
 * 会话状态文案；避免在模板中拼 i18n key。
 */
const statusLabel = computed(() => {
  switch (props.session.status) {
    case 'running':
      return t('session.status.running');
    case 'waiting_approval':
      return t('session.status.waiting_approval');
    case 'waiting_user':
      return t('session.status.waiting_user');
    case 'completed':
      return t('session.status.completed');
    case 'failed':
      return t('session.status.failed');
    case 'interrupted':
      return t('session.status.interrupted');
    case 'archived':
      return t('session.status.archived');
    default:
      return t('session.status.idle');
  }
});
</script>

<style scoped lang="less">
.nh-session-item {
  position: relative;
  display: flex;
  width: 100%;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  border-radius: var(--nh-radius-md);
  background: transparent;
  color: var(--nh-color-text-primary);
  cursor: pointer;
  text-align: left;
  transition:
    background var(--nh-duration-fast) var(--nh-ease-standard),
    border-color var(--nh-duration-fast) var(--nh-ease-standard);
}

.nh-session-item:hover {
  background: var(--nh-color-bg-hover);
}

.nh-session-item--active {
  background: var(--nh-color-bg-elevated);
  background: color-mix(in srgb, var(--nh-color-accent) 7%, var(--nh-color-bg-base));
  box-shadow: var(--nh-highlight);
}

.nh-session-item__dot {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 50%;
  background: var(--nh-color-text-disabled);
}

.nh-session-item__dot--running,
.nh-session-item__dot--waiting_approval,
.nh-session-item__dot--waiting_user {
  background: var(--nh-color-accent);
}

.nh-session-item__dot--failed {
  background: var(--nh-color-danger);
}

.nh-session-item__dot--completed {
  background: var(--nh-color-success);
}

.nh-session-item__body {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.nh-session-item__title-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
}

.nh-session-item__title,
.nh-session-item__meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-session-item__title {
  font-size: 14px;
  font-weight: 500;
}

.nh-session-item__meta {
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-session-item__actions {
  display: none;
  flex: none;
  gap: 4px;
}

.nh-session-item:hover .nh-session-item__actions,
.nh-session-item:focus-within .nh-session-item__actions {
  display: flex;
}
</style>
