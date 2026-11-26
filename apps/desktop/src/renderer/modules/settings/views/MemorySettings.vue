<template>
  <section class="nh-memory">
    <p class="nh-memory__hint">{{ t('memory.hint') }}</p>

    <div class="nh-memory__settings">
      <div class="nh-memory__setting-row">
        <div>
          <p class="nh-memory__setting-title">{{ t('memory.autoCapture') }}</p>
          <p class="nh-memory__setting-hint">{{ t('memory.autoCaptureHint') }}</p>
        </div>
        <NSwitch
          :value="settings.autoCapture"
          :loading="savingSettings === 'autoCapture'"
          @update:value="updateSetting('autoCapture', $event)"
        />
      </div>
      <div class="nh-memory__setting-row nh-memory__setting-row--divided">
        <div>
          <p class="nh-memory__setting-title">{{ t('memory.retrieval') }}</p>
          <p class="nh-memory__setting-hint">{{ t('memory.retrievalHint') }}</p>
        </div>
        <NSwitch
          :value="settings.retrieval"
          :loading="savingSettings === 'retrieval'"
          @update:value="updateSetting('retrieval', $event)"
        />
      </div>
    </div>

    <div class="nh-memory__header">
      <p class="nh-memory__group-title">{{ t('memory.listTitle') }}</p>
      <NButton secondary size="small" :loading="rebuilding" @click="rebuildIndex">
        <template #icon><AppIcon name="refresh" :size="14" /></template>
        {{ t('memory.rebuildIndex') }}
      </NButton>
    </div>

    <section v-if="conflictGroups.length" class="nh-memory__conflicts">
      <div class="nh-memory__conflict-heading">
        <AppIcon name="alert" :size="15" />
        <p>{{ t('memory.conflictHint') }}</p>
      </div>
      <div v-for="group in conflictGroups" :key="group.key" class="nh-memory__conflict-group">
        <div class="nh-memory__conflict-title">
          <strong>{{ group.title }}</strong>
          <span class="nh-memory__conflict-count">{{ group.items.length }}</span>
        </div>
        <div v-for="item in group.items" :key="item.id" class="nh-memory__conflict-row">
          <div class="nh-memory__conflict-copy">
            <span>{{ item.content }}</span>
            <small>{{ sourceLabel(item) }} · {{ formatTime(item.lastUsedAt) }}</small>
          </div>
          <NPopconfirm @positive-click="keepConflictItem(group, item)">
            <template #trigger>
              <NButton text size="small" type="primary">
                {{ t('memory.keepThis') }}
              </NButton>
            </template>
            {{ t('memory.keepConfirm') }}
          </NPopconfirm>
        </div>
      </div>
    </section>

    <NEmpty
      v-if="!loading && !normalMemories.length && !conflictGroups.length"
      class="nh-memory__empty"
      :description="t('memory.empty')"
    >
      <template #icon><AppIcon name="brain" :size="34" /></template>
    </NEmpty>

    <div v-else-if="normalMemories.length" class="nh-memory__list">
      <article v-for="item in normalMemories" :key="item.id" class="nh-memory__item">
        <div class="nh-memory__item-head">
          <div class="nh-memory__item-title">
            <strong>{{ item.title }}</strong>
            <NTag size="tiny" :bordered="false">{{ kindLabel(item.kind) }}</NTag>
          </div>
          <NPopconfirm @positive-click="remove(item)">
            <template #trigger>
              <NButton text size="tiny" type="error" :loading="deleting === item.id">
                <template #icon><AppIcon name="trash" :size="13" /></template>
                {{ t('memory.delete') }}
              </NButton>
            </template>
            {{ t('memory.deleteConfirm') }}
          </NPopconfirm>
        </div>
        <p class="nh-memory__content">{{ item.content }}</p>
        <p class="nh-memory__meta">
          <span>{{ t('memory.source') }}: {{ sourceLabel(item) }}</span>
          <span>{{ t('memory.lastUsed') }}: {{ formatTime(item.lastUsedAt) }}</span>
        </p>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * 记忆设置：自动沉淀/检索开关与已保存记忆列表。
 */

import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { NButton, NEmpty, NPopconfirm, NSwitch, NTag, useMessage } from 'naive-ui';
import type { MemoryItem, MemoryKind, MemorySettings } from '@shared/memory';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import {
  getMemorySettings,
  listMemories,
  removeMemory,
  rebuildMemoryIndex,
  setMemorySettings,
  subscribeMemoryChanges
} from '@/app/memory.api';

const message = useMessage();
const memories = ref<MemoryItem[]>([]);
const settings = reactive<MemorySettings>({ autoCapture: true, retrieval: true });
const loading = ref(false);
const deleting = ref<string>();
const savingSettings = ref<keyof MemorySettings>();
const rebuilding = ref(false);
let unsubscribeMemoryChanges: (() => void) | undefined;

const kindLabel = (kind: MemoryKind): string => t(`memory.kind.${kind}`);
const normalizeTitle = (title: string): string =>
  title.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
const conflictKeys = computed(() => {
  const counts = new Map<string, number>();
  for (const item of memories.value) {
    const key = normalizeTitle(item.title);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
});
const normalMemories = computed(() =>
  memories.value.filter((item) => !conflictKeys.value.has(normalizeTitle(item.title)))
);
const conflictGroups = computed(() => {
  const groups = new Map<string, { key: string; title: string; items: MemoryItem[] }>();
  for (const item of memories.value) {
    const key = normalizeTitle(item.title);
    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, { key, title: item.title, items: [item] });
  }
  return [...groups.values()].filter((group) => group.items.length > 1);
});
const formatTime = (value: number | undefined): string =>
  value === undefined ? t('memory.never') : new Date(value).toLocaleString();
const sourceLabel = (item: MemoryItem): string =>
  item.sourceSessionTitle ??
  (item.sourceSessionId ? item.sourceSessionId.slice(0, 8) : t('memory.sourceManual'));

const load = async (): Promise<void> => {
  loading.value = true;
  try {
    const [items, current] = await Promise.all([listMemories(), getMemorySettings()]);
    memories.value = items.filter((item) => item.status !== 'proposed');
    Object.assign(settings, current);
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('memory.loadFailed'));
  } finally {
    loading.value = false;
  }
};

const updateSetting = async (key: keyof MemorySettings, value: boolean): Promise<void> => {
  const previous = settings[key];
  settings[key] = value;
  savingSettings.value = key;
  try {
    Object.assign(settings, await setMemorySettings({ ...settings }));
  } catch (reason) {
    settings[key] = previous;
    message.error(reason instanceof Error ? reason.message : t('memory.saveFailed'));
  } finally {
    savingSettings.value = undefined;
  }
};

const rebuildIndex = async (): Promise<void> => {
  rebuilding.value = true;
  try {
    const rebuilt = await rebuildMemoryIndex();
    if (rebuilt) message.success(t('memory.indexRebuilt'));
    else message.error(t('memory.indexRebuildFailed'));
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('memory.indexRebuildFailed'));
  } finally {
    rebuilding.value = false;
  }
};

const keepConflictItem = async (
  group: { items: MemoryItem[] },
  keep: MemoryItem
): Promise<void> => {
  try {
    await Promise.all(
      group.items.filter((item) => item.id !== keep.id).map((item) => removeMemory(item.id))
    );
    await load();
    message.success(t('memory.conflictResolved'));
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('memory.resolveFailed'));
  }
};

const remove = async (item: MemoryItem): Promise<void> => {
  deleting.value = item.id;
  try {
    await removeMemory(item.id);
    await load();
    message.success(t('memory.deleted'));
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('memory.deleteFailed'));
  } finally {
    deleting.value = undefined;
  }
};

onMounted(() => {
  load();
  unsubscribeMemoryChanges = subscribeMemoryChanges(() => {
    load();
  });
});

onBeforeUnmount(() => {
  unsubscribeMemoryChanges?.();
  unsubscribeMemoryChanges = undefined;
});
</script>

<style scoped lang="less">
.nh-memory {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 14px;
}

.nh-memory__hint,
.nh-memory__setting-hint {
  margin: 0;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.nh-memory__settings {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 10px;
}

.nh-memory__setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px;
}

.nh-memory__setting-row--divided {
  border-top: 1px solid var(--nh-border-subtle);
}

.nh-memory__setting-title {
  margin: 0;
  color: var(--nh-color-text-primary);
  font-size: 13px;
  font-weight: 600;
}

.nh-memory__setting-hint {
  margin-top: 3px;
}

.nh-memory__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.nh-memory__conflicts {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--nh-color-warning) 34%, var(--nh-border-subtle));
  border-radius: 12px;
  background: color-mix(in srgb, var(--nh-color-warning) 6%, transparent);
}

.nh-memory__conflict-heading {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  color: var(--nh-color-warning);
}

.nh-memory__conflict-heading p {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
}

.nh-memory__conflict-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid color-mix(in srgb, var(--nh-color-warning) 24%, transparent);
}

.nh-memory__conflict-title {
  display: flex;
  align-items: center;
  gap: 7px;
}

.nh-memory__conflict-title strong {
  font-size: 12px;
}

.nh-memory__conflict-count {
  display: inline-flex;
  min-width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--nh-color-warning) 16%, transparent);
  color: var(--nh-color-warning);
  font-size: 10px;
}

.nh-memory__conflict-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--nh-color-bg-base) 54%, transparent);
}

.nh-memory__conflict-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  line-height: 1.55;
}

.nh-memory__conflict-copy span {
  overflow-wrap: anywhere;
}

.nh-memory__conflict-copy small {
  color: var(--nh-color-text-disabled);
  font-size: 10px;
}

.nh-memory__group-title {
  margin: 0;
  color: var(--nh-color-text-primary);
  font-size: 13px;
  font-weight: 600;
}

.nh-memory__empty {
  display: flex;
  min-height: 220px;
  align-items: center;
  justify-content: center;
  padding: 28px;
  border: 1px dashed var(--nh-border-subtle);
  border-radius: 14px;
}

.nh-memory__list {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  padding-right: 4px;
  scrollbar-gutter: stable;
}

.nh-memory__item {
  padding: 12px;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 10px;
  background: var(--nh-color-bg-elevated);
}

.nh-memory__item-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.nh-memory__item-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.nh-memory__item-title strong {
  font-size: 13px;
}

.nh-memory__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 7px 0 0;
  color: var(--nh-color-text-disabled);
  font-size: 11px;
}

.nh-memory__content {
  margin: 8px 0 0;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  line-height: 1.65;
  white-space: pre-wrap;
}
</style>
