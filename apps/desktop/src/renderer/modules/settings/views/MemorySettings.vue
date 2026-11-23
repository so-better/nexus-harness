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
    </div>

    <NEmpty
      v-if="!loading && !memories.length"
      class="nh-memory__empty"
      :description="t('memory.empty')"
    >
      <template #icon><AppIcon name="brain" :size="34" /></template>
    </NEmpty>

    <div v-else class="nh-memory__list">
      <article v-for="item in memories" :key="item.id" class="nh-memory__item">
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
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * 记忆设置：自动沉淀/检索开关与已保存记忆列表。
 */

import { onMounted, reactive, ref } from 'vue';
import { NButton, NEmpty, NPopconfirm, NSwitch, NTag, useMessage } from 'naive-ui';
import type { MemoryItem, MemoryKind, MemorySettings } from '@shared/memory';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import { getMemorySettings, listMemories, removeMemory, setMemorySettings } from '@/app/memory.api';

const message = useMessage();
const memories = ref<MemoryItem[]>([]);
const settings = reactive<MemorySettings>({ autoCapture: true, retrieval: true });
const loading = ref(false);
const deleting = ref<string>();
const savingSettings = ref<keyof MemorySettings>();

const kindLabel = (kind: MemoryKind): string => t(`memory.kind.${kind}`);

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

onMounted(load);
</script>

<style scoped lang="less">
.nh-memory {
  display: flex;
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
  max-height: min(480px, 55vh);
  flex-direction: column;
  gap: 8px;
  overflow: auto;
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

.nh-memory__content {
  margin: 8px 0 0;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  line-height: 1.65;
  white-space: pre-wrap;
}
</style>
