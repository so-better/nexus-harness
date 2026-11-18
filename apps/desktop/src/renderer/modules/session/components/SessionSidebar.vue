<template>
  <aside class="nh-sidebar">
    <header class="nh-sidebar__header">
      <div class="nh-sidebar__brand">
        <span class="nh-sidebar__mark">N</span>
        <span class="nh-sidebar__name">{{ t('app.brand') }}</span>
      </div>
      <NButton class="nh-sidebar__create" text type="primary" @click="emit('create')">
        <template #icon>
          <AppIcon name="plus" />
        </template>
        {{ t('app.newSession') }}
      </NButton>
    </header>

    <div class="nh-sidebar__search">
      <NInput
        v-model:value="query"
        size="small"
        clearable
        :placeholder="t('search.placeholder')"
        :aria-label="t('search.placeholder')"
        @keydown.esc="clearSearch"
      >
        <template #prefix>
          <AppIcon name="search" :size="14" />
        </template>
      </NInput>
    </div>

    <div class="nh-sidebar__scroll">
      <div v-if="hasQuery" class="nh-sidebar__body">
        <p class="nh-sidebar__group-title">{{ t('search.results') }}</p>
        <div v-if="searching" class="nh-sidebar__search-state">
          <NSpin size="small" />
        </div>
        <p v-else-if="searchError" class="nh-sidebar__search-error">{{ searchError }}</p>
        <p v-else-if="results.length === 0" class="nh-sidebar__search-empty">
          {{ t('search.empty') }}
        </p>
        <template v-else>
          <SessionSearchResultItem
            v-for="result in results"
            :key="result.sessionId"
            :result="result"
            @select="openSearchResult(result.sessionId)"
          />
        </template>
      </div>
      <div v-else-if="loading" class="nh-sidebar__state">
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
      <div v-else class="nh-sidebar__body">
        <section v-for="group in groups" :key="group.key" class="nh-sidebar__group">
          <p class="nh-sidebar__group-title">{{ group.label }}</p>
          <SessionListItem
            v-for="session in group.items"
            :key="session.id"
            :session="session"
            :active="session.id === activeId"
            @select="emit('select', session.id)"
            @remove="emit('remove', session.id)"
            @rename="(title: string) => emit('rename', session.id, title)"
            @toggle-pin="emit('toggle-pin', session.id)"
          />
        </section>
      </div>
    </div>

    <footer class="nh-sidebar__footer">
      <span>{{ sessionCountLabel }}</span>
      <NPopconfirm v-if="sessions.length > 0" placement="top" @positive-click="emit('clear-all')">
        <template #trigger>
          <NButton text size="tiny" class="nh-sidebar__clear">
            <template #icon>
              <AppIcon name="trash" :size="13" />
            </template>
            {{ t('session.clearAll') }}
          </NButton>
        </template>
        {{ t('session.clearAllConfirm') }}
      </NPopconfirm>
    </footer>
  </aside>
</template>

<script setup lang="ts">
/**
 * 会话侧栏：按置顶与日期分组展示会话，并转发新建、选择、删除与置顶操作。
 */

import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { NButton, NEmpty, NInput, NPopconfirm, NSpin } from 'naive-ui';
import type { SessionSearchResult, SessionSummary } from '@shared/ipc/contracts';
import { locale, t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import { searchSessions } from '../api/session.api';
import SessionListItem from './SessionListItem.vue';
import SessionSearchResultItem from './SessionSearchResultItem.vue';

interface SessionGroup {
  key: 'pinned' | 'today' | 'yesterday' | 'earlier';
  label: string;
  items: SessionSummary[];
}

const props = defineProps<{
  sessions: SessionSummary[];
  activeId?: string | undefined;
  loading: boolean;
}>();

const emit = defineEmits<{
  create: [];
  select: [id: string];
  remove: [id: string];
  rename: [id: string, title: string];
  'clear-all': [];
  'toggle-pin': [id: string];
}>();

const query = ref('');
const results = ref<SessionSearchResult[]>([]);
const searching = ref(false);
const searchError = ref<string | undefined>();
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let searchRequest = 0;

const hasQuery = computed(() => query.value.trim().length > 0);

/**
 * 输入防抖搜索；只接受最后一次请求的结果。
 */
watch(query, (value) => {
  if (debounceTimer) clearTimeout(debounceTimer);
  const keyword = value.trim();
  searchRequest += 1;
  const request = searchRequest;
  searchError.value = undefined;

  if (!keyword) {
    results.value = [];
    searching.value = false;
    return;
  }

  searching.value = true;
  debounceTimer = setTimeout(async () => {
    try {
      const found = await searchSessions(keyword);
      if (request !== searchRequest) return;
      results.value = found;
    } catch (reason) {
      if (request !== searchRequest) return;
      results.value = [];
      searchError.value = reason instanceof Error ? reason.message : t('search.failed');
    } finally {
      if (request === searchRequest) searching.value = false;
    }
  }, 240);
});

/**
 * 清空搜索并回到完整会话列表。
 */
const clearSearch = (): void => {
  query.value = '';
};

/**
 * 打开搜索结果并退出搜索态。
 */
const openSearchResult = (id: string): void => {
  emit('select', id);
  query.value = '';
};

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
  searchRequest += 1;
});

const sessionCountLabel = computed(() => {
  const unit = props.sessions.length === 1 ? t('app.sessionCountOne') : t('app.sessionCountMany');
  return `${props.sessions.length}${locale.value === 'zh-CN' ? '' : ' '}${unit}`;
});

const groups = computed<SessionGroup[]>(() => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const pinned: SessionSummary[] = [];
  const today: SessionSummary[] = [];
  const yesterday: SessionSummary[] = [];
  const earlier: SessionSummary[] = [];

  for (const session of props.sessions) {
    if (session.pinned) {
      pinned.push(session);
    } else if (session.lastActiveAt >= todayStart) {
      today.push(session);
    } else if (session.lastActiveAt >= yesterdayStart.getTime()) {
      yesterday.push(session);
    } else {
      earlier.push(session);
    }
  }

  return [
    { key: 'pinned', label: t('session.groupPinned'), items: pinned },
    { key: 'today', label: t('session.groupToday'), items: today },
    { key: 'yesterday', label: t('session.groupYesterday'), items: yesterday },
    { key: 'earlier', label: t('session.groupEarlier'), items: earlier }
  ].filter((group) => group.items.length > 0) as SessionGroup[];
});
</script>

<style scoped lang="less">
.nh-sidebar {
  display: flex;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
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
  box-shadow: inset 0 -1px 0 var(--nh-color-border);
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
  color: var(--nh-color-bg-base);
  font-size: 12px;
  font-weight: 600;
}

.nh-sidebar__name {
  font-size: 14px;
  font-weight: 600;
}

.nh-sidebar__search {
  flex: none;
  padding: 10px 12px 2px;
}

.nh-sidebar__scroll {
  min-height: 0;
  flex: 1;
  overflow: hidden auto;
}

.nh-sidebar__search-state {
  display: grid;
  padding: 24px 0;
  place-items: center;
}

.nh-sidebar__search-error,
.nh-sidebar__search-empty {
  margin: 0;
  padding: 24px 12px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  text-align: center;
}

.nh-sidebar__search-error {
  color: var(--nh-color-danger);
}

.nh-sidebar__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 10px 8px 12px;
}

.nh-sidebar__group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nh-sidebar__create {
  height: 28px;
  padding: 0 4px;
}

.nh-sidebar__group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 2px 12px;
  color: var(--nh-color-text-disabled);
  font-size: 12px;
  font-weight: 500;
}

.nh-sidebar__group-title::after {
  height: 1px;
  flex: 1;
  background: var(--nh-color-border);
  content: '';
}

.nh-sidebar__state {
  padding: 24px 8px;
}

.nh-sidebar__footer {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid var(--nh-color-border);
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-sidebar__clear {
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-sidebar__clear:hover {
  color: var(--nh-color-danger);
}
</style>
