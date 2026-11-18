<template>
  <aside class="nh-sidebar">
    <header class="nh-sidebar__header">
      <span class="nh-sidebar__brand">{{ t('app.brand') }}</span>
      <button type="button" class="nh-sidebar__new" @click="emit('create')">
        {{ t('app.newSession') }}
      </button>
    </header>

    <div class="nh-sidebar__body">
      <p v-if="loading" class="nh-sidebar__hint">{{ t('app.loading') }}</p>
      <p v-else-if="sessions.length === 0" class="nh-sidebar__hint">
        {{ t('app.emptyNoSession') }}
      </p>
      <SessionListItem
        v-for="session in sessions"
        :key="session.id"
        :session="session"
        :active="session.id === activeId"
        @select="emit('select', session.id)"
        @remove="emit('remove', session.id)"
        @toggle-pin="emit('toggle-pin', session.id)"
      />
    </div>

    <footer class="nh-sidebar__footer">
      <span class="nh-sidebar__hint">{{ t('app.sessionCount') }} {{ sessions.length }}</span>
    </footer>
  </aside>
</template>

<script setup lang="ts">
/**
 * 会话侧栏：展示会话列表并转发新建、选择、删除与置顶操作。
 */

import type { SessionSummary } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import SessionListItem from './SessionListItem.vue';

defineProps<{
  sessions: SessionSummary[];
  activeId?: string | undefined;
  loading: boolean;
}>();

const emit = defineEmits<{
  create: [];
  select: [id: string];
  remove: [id: string];
  'toggle-pin': [id: string];
}>();
</script>

<style scoped lang="less">
.nh-sidebar {
  display: flex;
  min-width: 0;
  flex-direction: column;
  border-right: 1px solid var(--nh-color-border);
  background: var(--nh-color-bg-elevated);
}

.nh-sidebar__header {
  display: flex;
  height: 44px;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: var(--nh-space-sm);
  padding: 0 12px;
  border-bottom: 1px solid var(--nh-color-border);
}

.nh-sidebar__brand {
  font-size: 16px;
  font-weight: 600;
}

.nh-sidebar__new,
.nh-sidebar__footer {
  color: var(--nh-color-text-secondary);
}

.nh-sidebar__new {
  padding: 6px 8px;
  border: 1px solid var(--nh-color-border);
  border-radius: var(--nh-radius-sm);
  background: transparent;
  font-size: 12px;
}

.nh-sidebar__new:hover {
  background: var(--nh-color-bg-hover);
}

.nh-sidebar__body {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  overflow: auto;
  padding: 8px;
}

.nh-sidebar__hint {
  margin: 0;
  padding: 8px 12px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-sidebar__footer {
  flex: none;
  border-top: 1px solid var(--nh-color-border);
}
</style>
