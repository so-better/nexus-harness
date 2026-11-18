<template>
  <aside class="nh-sidebar">
    <header class="nh-sidebar__header">
      <div class="nh-sidebar__brand">
        <span class="nh-sidebar__mark">N</span>
        <span class="nh-sidebar__name">{{ t('app.brand') }}</span>
      </div>
      <NButton size="small" secondary @click="emit('create')">
        <template #icon>
          <AppIcon name="plus" />
        </template>
        {{ t('app.newSession') }}
      </NButton>
    </header>

    <NScrollbar class="nh-sidebar__scroll">
      <div class="nh-sidebar__body">
        <div v-if="loading" class="nh-sidebar__state">
          <NSpin size="small" />
        </div>
        <NEmpty
          v-else-if="sessions.length === 0"
          class="nh-sidebar__state"
          size="small"
          :description="t('app.emptyNoSession')"
        >
          <template #icon>
            <AppIcon name="spark" :size="28" />
          </template>
        </NEmpty>
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
    </NScrollbar>

    <footer class="nh-sidebar__footer">
      <span>{{ t('app.sessionCount') }} {{ sessions.length }}</span>
    </footer>
  </aside>
</template>

<script setup lang="ts">
/**
 * 会话侧栏：展示会话列表并转发新建、选择、删除与置顶操作。
 */

import { NButton, NEmpty, NScrollbar, NSpin } from 'naive-ui';
import type { SessionSummary } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
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
  height: 56px;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 16px;
  border-bottom: 1px solid var(--nh-color-border);
}

.nh-sidebar__brand {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.nh-sidebar__mark {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 8px;
  background: var(--nh-color-accent);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}

.nh-sidebar__name {
  font-size: 14px;
  font-weight: 600;
}

.nh-sidebar__scroll {
  flex: 1;
  min-height: 0;
}

.nh-sidebar__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
}

.nh-sidebar__state {
  padding: 24px 8px;
}

.nh-sidebar__footer {
  flex: none;
  padding: 10px 16px;
  border-top: 1px solid var(--nh-color-border);
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}
</style>
