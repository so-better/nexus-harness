<template>
  <aside class="nh-sidebar">
    <header class="nh-sidebar__header">
      <div class="nh-sidebar__brand">
        <span class="nh-sidebar__mark">N</span>
        <span class="nh-sidebar__name">{{ t('app.brand') }}</span>
      </div>
      <div class="nh-sidebar__header-actions">
        <NButton
          text
          size="small"
          class="nh-sidebar__icon-button"
          :title="searchMode ? t('search.close') : t('search.open')"
          :aria-label="searchMode ? t('search.close') : t('search.open')"
          @click="toggleSearch"
        >
          <template #icon>
            <AppIcon :name="searchMode ? 'close' : 'search'" :size="15" />
          </template>
        </NButton>
        <NButton
          v-if="!searchMode"
          class="nh-sidebar__create"
          text
          type="primary"
          @click="emit('create')"
        >
          <template #icon>
            <AppIcon name="plus" />
          </template>
          {{ t('app.newSession') }}
        </NButton>
      </div>
    </header>

    <div v-if="searchMode" class="nh-sidebar__search">
      <NInput
        ref="searchInput"
        v-model:value="query"
        size="small"
        clearable
        :placeholder="t('search.placeholder')"
        :aria-label="t('search.placeholder')"
        @keydown="handleSearchKeydown"
        @compositionstart="searchComposing = true"
        @compositionend="searchComposing = false"
      >
        <template #prefix>
          <AppIcon name="search" :size="14" />
        </template>
      </NInput>
    </div>

    <div class="nh-sidebar__scroll">
      <div v-if="searchMode" class="nh-sidebar__body">
        <div v-if="searching" class="nh-sidebar__search-state">
          <NSpin size="small" />
        </div>
        <p v-else-if="searchError" class="nh-sidebar__search-error">{{ searchError }}</p>
        <p v-else-if="results.length === 0" class="nh-sidebar__search-empty">
          {{ query.trim() ? t('search.empty') : t('search.prompt') }}
        </p>
        <div v-else ref="resultsRef" class="nh-sidebar__search-results" role="listbox">
          <SessionSearchResultItem
            v-for="(result, index) in results"
            :key="result.messageId"
            :result="result"
            :active="index === activeHitIndex"
            @mouseenter="activeHitIndex = index"
            @select="openSearchResult(result)"
          />
        </div>
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

    <footer v-if="!searchMode" class="nh-sidebar__footer">
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

import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { NButton, NEmpty, NInput, NPopconfirm, NSpin, type InputInst } from 'naive-ui';
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
  'open-message': [sessionId: string, messageId: string];
  'toggle-pin': [id: string];
}>();

const searchMode = ref(false);
const query = ref('');
const results = ref<SessionSearchResult[]>([]);
const searching = ref(false);
const searchError = ref<string | undefined>();
const activeHitIndex = ref(-1);
const searchInput = ref<InputInst | null>(null);
const resultsRef = ref<HTMLElement | null>(null);
const searchComposing = ref(false);
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let searchRequest = 0;

/**
 * 打开搜索面板并聚焦输入框。
 */
const openSearch = async (): Promise<void> => {
  searchMode.value = true;
  await nextTick();
  searchInput.value?.focus();
};

/**
 * 关闭搜索并清空结果。
 */
const closeSearch = (): void => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = undefined;
  searchRequest += 1;
  searchMode.value = false;
  query.value = '';
  results.value = [];
  searching.value = false;
  searchError.value = undefined;
  activeHitIndex.value = -1;
};

/**
 * 切换搜索面板。
 */
const toggleSearch = (): void => {
  if (searchMode.value) closeSearch();
  else void openSearch();
};

/**
 * 输入防抖搜索；只接受最后一次请求的结果。
 */
watch(query, (value) => {
  if (!searchMode.value) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  const keyword = value.trim();
  searchRequest += 1;
  const request = searchRequest;
  searchError.value = undefined;

  if (!keyword) {
    results.value = [];
    searching.value = false;
    activeHitIndex.value = -1;
    return;
  }

  searching.value = true;
  debounceTimer = setTimeout(async () => {
    try {
      const found = await searchSessions(keyword);
      if (request !== searchRequest) return;
      results.value = found;
      activeHitIndex.value = found.length > 0 ? 0 : -1;
    } catch (reason) {
      if (request !== searchRequest) return;
      results.value = [];
      activeHitIndex.value = -1;
      searchError.value = reason instanceof Error ? reason.message : t('search.failed');
    } finally {
      if (request === searchRequest) searching.value = false;
    }
  }, 240);
});

/**
 * 把键盘选中的结果滚动到可见区域。
 */
const scrollActiveHit = async (): Promise<void> => {
  await nextTick();
  const target = resultsRef.value?.querySelector<HTMLElement>(
    `.nh-search-result:nth-child(${activeHitIndex.value + 1})`
  );
  target?.scrollIntoView({ block: 'nearest' });
};

/**
 * 搜索框键盘操作。
 */
const handleSearchKeydown = (event: KeyboardEvent): void => {
  if (event.isComposing || searchComposing.value) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeSearch();
    return;
  }
  if (!results.value.length) return;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    activeHitIndex.value = Math.min(activeHitIndex.value + 1, results.value.length - 1);
    void scrollActiveHit();
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    activeHitIndex.value = Math.max(activeHitIndex.value - 1, 0);
    void scrollActiveHit();
    return;
  }
  if (event.key === 'Enter') {
    const hit = results.value[activeHitIndex.value];
    if (!hit) return;
    event.preventDefault();
    openSearchResult(hit);
  }
};

/**
 * 打开消息命中：关闭搜索并交给主布局定位。
 */
const openSearchResult = (result: SessionSearchResult): void => {
  emit('open-message', result.sessionId, result.messageId);
  closeSearch();
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

.nh-sidebar__header-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 4px;
}

.nh-sidebar__icon-button {
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 6px;
  color: var(--nh-color-text-secondary);
}

.nh-sidebar__icon-button:hover {
  background: var(--nh-color-bg-hover);
  color: var(--nh-color-text-primary);
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

.nh-sidebar__search-results {
  display: flex;
  flex-direction: column;
  gap: 2px;
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
