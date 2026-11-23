<template>
  <section v-if="!running && candidates.length" class="nh-memory-candidates">
    <div class="nh-memory-candidates__header">
      <div class="nh-memory-candidates__title">
        <AppIcon name="brain" :size="14" />
        <span>{{ t('memory.suggestion') }}</span>
      </div>
      <span class="nh-memory-candidates__hint">{{ t('memory.suggestionHint') }}</span>
    </div>
    <article v-for="item in candidates" :key="item.id" class="nh-memory-candidates__item">
      <div class="nh-memory-candidates__item-main">
        <strong>{{ item.title }}</strong>
        <NTag size="tiny" :bordered="false">{{ t(`memory.kind.${item.kind}`) }}</NTag>
        <p>{{ item.content }}</p>
      </div>
      <div class="nh-memory-candidates__actions">
        <span v-if="savedIds.includes(item.id)" class="nh-memory-candidates__saved">
          <AppIcon name="check" :size="14" />
          {{ t('memory.saved') }}
        </span>
        <template v-else>
          <NButton size="medium" secondary @click="dismiss(item)">
            <template #icon><AppIcon name="close" :size="14" /></template>
            {{ t('memory.ignore') }}
          </NButton>
          <NButton
            size="medium"
            type="primary"
            secondary
            :loading="saving === item.id"
            @click="save(item)"
          >
            <template #icon><AppIcon name="check" :size="14" /></template>
            {{ t('memory.save') }}
          </NButton>
        </template>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
/**
 * 会话内记忆候选：自动识别后由用户确认，不进入设置页。
 */

import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { NButton, NTag, useMessage } from 'naive-ui';
import type { MemoryItem } from '@shared/memory';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import {
  listMemories,
  removeMemory,
  subscribeMemoryCandidateEvents,
  updateMemory
} from '@/app/memory.api';

const props = defineProps<{ running: boolean }>();
const message = useMessage();
const candidates = ref<MemoryItem[]>([]);
const saving = ref<string>();
const savedIds = ref<string[]>([]);
const savedTimers = new Map<string, ReturnType<typeof setTimeout>>();
let unsubscribeCandidates: (() => void) | undefined;

const load = async (): Promise<void> => {
  try {
    const memories = await listMemories();
    candidates.value = memories.filter((item) => item.status === 'proposed');
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('memory.loadFailed'));
  }
};

const save = async (item: MemoryItem): Promise<void> => {
  if (savedIds.value.includes(item.id)) return;
  saving.value = item.id;
  try {
    await updateMemory({ id: item.id, status: 'active' });
    savedIds.value = [...savedIds.value, item.id];
    const timer = setTimeout(() => {
      candidates.value = candidates.value.filter((candidate) => candidate.id !== item.id);
      savedIds.value = savedIds.value.filter((id) => id !== item.id);
      savedTimers.delete(item.id);
    }, 2_500);
    savedTimers.set(item.id, timer);
    message.success(t('memory.saved'));
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('memory.saveFailed'));
  } finally {
    saving.value = undefined;
  }
};

const dismiss = async (item: MemoryItem): Promise<void> => {
  try {
    await removeMemory(item.id);
    candidates.value = candidates.value.filter((candidate) => candidate.id !== item.id);
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('memory.deleteFailed'));
  }
};

onMounted(() => {
  load();
  unsubscribeCandidates = subscribeMemoryCandidateEvents(() => {
    load();
  });
});

onBeforeUnmount(() => {
  unsubscribeCandidates?.();
  unsubscribeCandidates = undefined;
  for (const timer of savedTimers.values()) clearTimeout(timer);
  savedTimers.clear();
});

watch(
  () => props.running,
  (running, previous) => {
    if (previous && !running) load();
  }
);
</script>

<style scoped lang="less">
.nh-memory-candidates {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0 auto 10px;
  padding: 10px 12px;
  width: calc(100% - 32px);
  max-width: 1104px;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 12px;
  background: var(--nh-surface-elevated);
}

.nh-memory-candidates__header,
.nh-memory-candidates__title,
.nh-memory-candidates__item,
.nh-memory-candidates__actions {
  display: flex;
  align-items: center;
}

.nh-memory-candidates__header {
  justify-content: space-between;
  gap: 12px;
}

.nh-memory-candidates__title {
  gap: 6px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.nh-memory-candidates__hint {
  color: var(--nh-color-text-disabled);
  font-size: 11px;
}

.nh-memory-candidates__item {
  justify-content: space-between;
  gap: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--nh-border-subtle);
}

.nh-memory-candidates__item-main {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.nh-memory-candidates__item-main strong {
  font-size: 12px;
}

.nh-memory-candidates__item-main p {
  width: 100%;
  margin: 0;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.nh-memory-candidates__actions {
  flex: none;
  gap: 4px;
}

.nh-memory-candidates__saved {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--nh-color-success);
  font-size: 12px;
}
</style>
