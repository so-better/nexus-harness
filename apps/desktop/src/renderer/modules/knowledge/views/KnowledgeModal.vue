<template>
  <NModal
    :show="show"
    preset="card"
    class="nh-knowledge"
    style="width: min(860px, calc(100vw - 48px))"
    :title="t('knowledge.title')"
    :bordered="false"
    @update:show="emit('update:show', $event)"
  >
    <div class="nh-knowledge__header">
      <div class="nh-knowledge__intro">
        <p>{{ t('knowledge.hint') }}</p>
        <p class="nh-knowledge__limit">{{ t('knowledge.limitHint') }}</p>
      </div>
      <div class="nh-knowledge__actions">
        <NButton type="primary" secondary :loading="importing === 'files'" @click="importFiles">
          <template #icon><AppIcon name="upload" :size="14" /></template>
          {{ t('knowledge.importFiles') }}
        </NButton>
        <NButton secondary :loading="scanning" @click="scanFolder">
          <template #icon><AppIcon name="folder" :size="14" /></template>
          {{ t('knowledge.importFolder') }}
        </NButton>
        <NButton secondary @click="openDirectory">
          <template #icon><AppIcon name="database" :size="14" /></template>
          {{ t('knowledge.openDirectory') }}
        </NButton>
      </div>
    </div>

    <div v-if="directoryScan" class="nh-knowledge__scan">
      <div class="nh-knowledge__scan-copy">
        <strong>{{ t('knowledge.scanTitle') }}</strong>
        <p v-if="directoryScan.fileCount">
          {{
            t('knowledge.scanSummary', {
              count: directoryScan.fileCount,
              size: formatBytes(directoryScan.totalBytes)
            })
          }}
        </p>
        <p v-else>{{ t('knowledge.scanEmpty') }}</p>
        <p v-if="directoryScan.skipped" class="nh-knowledge__scan-skipped">
          {{ t('knowledge.scanSkipped', { count: directoryScan.skipped }) }}
        </p>
        <p
          v-if="directoryScan.errors.length"
          class="nh-knowledge__scan-skipped"
          :title="directoryScan.errors.join('\n')"
        >
          {{ t('knowledge.scanErrors', { count: directoryScan.errors.length }) }}
          · {{ directoryScan.errors[0] }}
        </p>
        <p class="nh-knowledge__scan-path" :title="directoryScan.path">
          {{ directoryScan.path }}
        </p>
      </div>
      <div class="nh-knowledge__scan-actions">
        <NButton size="small" secondary @click="directoryScan = undefined">
          {{ t('knowledge.cancel') }}
        </NButton>
        <NButton
          size="small"
          type="primary"
          secondary
          :loading="importing === 'folder'"
          :disabled="!directoryScan.fileCount"
          @click="confirmFolder"
        >
          {{ t('knowledge.confirmImport') }}
        </NButton>
      </div>
    </div>

    <div class="nh-knowledge__list-head">
      <span>{{ t('knowledge.sources') }}</span>
      <span class="nh-knowledge__count">{{ sourceCount }}</span>
    </div>
    <div v-if="loading" class="nh-knowledge__loading"><NSpin size="small" /></div>
    <NEmpty
      v-else-if="!sources.length"
      class="nh-knowledge__empty"
      :description="t('knowledge.empty')"
    >
      <template #icon><AppIcon name="database" :size="30" /></template>
      <template #extra>
        <p class="nh-knowledge__empty-hint">{{ t('knowledge.emptyHint') }}</p>
      </template>
    </NEmpty>
    <div v-else class="nh-knowledge__list">
      <KnowledgeSourceItem
        v-for="source in sources"
        :key="source.id"
        :source="source"
        :busy="busyId === source.id"
        @reindex="reindex"
        @remove="remove"
        @open="openSource"
      />
    </div>
  </NModal>
</template>

<script setup lang="ts">
/**
 * 知识库管理：导入文件/目录、扫描确认与来源列表。
 */

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { NButton, NEmpty, NModal, NSpin, useMessage } from 'naive-ui';
import type {
  KnowledgeDirectoryScan,
  KnowledgeImportResult,
  KnowledgeSource
} from '@shared/knowledge';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import KnowledgeSourceItem from '../components/KnowledgeSourceItem.vue';
import {
  importKnowledgeDirectory,
  importKnowledgeFiles,
  listKnowledge,
  scanKnowledgeDirectory,
  onKnowledgeChanged,
  openKnowledgeSource,
  removeKnowledge,
  reindexKnowledge
} from '../api/knowledge.api';
import { openDataLocation } from '@/app/data-location.api';

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ 'update:show': [show: boolean] }>();
const message = useMessage();

const showError = (reason: unknown, fallback: string): void => {
  message.error(reason instanceof Error ? reason.message : fallback);
};

const sources = ref<KnowledgeSource[]>([]);
const loading = ref(false);
const importing = ref<'files' | 'folder'>();
const scanning = ref(false);
const directoryScan = ref<KnowledgeDirectoryScan>();
const busyId = ref<string>();
let unsubscribe: (() => void) | undefined;
let focusTimer: ReturnType<typeof setTimeout> | undefined;

const sourceCount = computed(() => sources.value.length);

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * 读取来源列表；失败时通过全局 message 提示。
 */
const load = async (): Promise<void> => {
  loading.value = true;
  try {
    sources.value = await listKnowledge();
  } catch (reason) {
    // 弹窗关闭时后台刷新失败不打扰用户
    if (props.show) showError(reason, t('knowledge.loadFailed'));
  } finally {
    loading.value = false;
  }
};

const notifyImport = async (result: KnowledgeImportResult | null): Promise<void> => {
  if (!result) return;
  await load();
  if (result.errors.length) {
    message.error(result.errors.slice(0, 3).join('\n'));
  } else {
    message.success(t('knowledge.imported', { count: result.sources.length }));
  }
};

/**
 * 导入文件或目录；选择取消时保持当前列表不变。
 */
const importFiles = async (): Promise<void> => {
  importing.value = 'files';
  try {
    await notifyImport(await importKnowledgeFiles());
  } catch (reason) {
    showError(reason, t('knowledge.importFailed'));
  } finally {
    importing.value = undefined;
  }
};

const scanFolder = async (): Promise<void> => {
  scanning.value = true;
  directoryScan.value = undefined;
  try {
    directoryScan.value = (await scanKnowledgeDirectory()) ?? undefined;
  } catch (reason) {
    showError(reason, t('knowledge.scanFailed'));
  } finally {
    scanning.value = false;
  }
};

const confirmFolder = async (): Promise<void> => {
  const pending = directoryScan.value;
  if (!pending?.fileCount) return;
  importing.value = 'folder';
  try {
    await notifyImport(await importKnowledgeDirectory({ token: pending.token }));
    directoryScan.value = undefined;
  } catch (reason) {
    showError(reason, t('knowledge.importFailed'));
  } finally {
    importing.value = undefined;
  }
};

const openDirectory = async (): Promise<void> => {
  try {
    await openDataLocation('knowledge');
  } catch (reason) {
    showError(reason, t('knowledge.openDirectoryFailed'));
  }
};

const reindex = async (source: KnowledgeSource): Promise<void> => {
  busyId.value = source.id;
  try {
    await reindexKnowledge(source.id);
    await load();
    message.success(t('knowledge.reindexed'));
  } catch (reason) {
    showError(reason, t('knowledge.reindexFailed'));
  } finally {
    busyId.value = undefined;
  }
};

const remove = async (source: KnowledgeSource): Promise<void> => {
  busyId.value = source.id;
  try {
    await removeKnowledge(source.id);
    await load();
    message.success(t('knowledge.deleted'));
  } catch (reason) {
    showError(reason, t('knowledge.deleteFailed'));
  } finally {
    busyId.value = undefined;
  }
};

const openSource = async (source: KnowledgeSource): Promise<void> => {
  try {
    await openKnowledgeSource(source.id);
  } catch {
    // 原始文件可能已被移动；不影响知识库索引
  }
};

watch(
  () => props.show,
  (show) => {
    if (show) {
      load().catch(() => undefined);
    } else {
      directoryScan.value = undefined;
    }
  }
);

const onWindowFocus = (): void => {
  if (!props.show) return;
  if (focusTimer) clearTimeout(focusTimer);
  focusTimer = setTimeout(() => {
    focusTimer = undefined;
    if (props.show) load().catch(() => undefined);
  }, 200);
};

onMounted(() => {
  if (props.show) load().catch(() => undefined);
  window.addEventListener('focus', onWindowFocus);
  unsubscribe = onKnowledgeChanged(() => {
    load().catch(() => undefined);
  });
});

onBeforeUnmount(() => {
  window.removeEventListener('focus', onWindowFocus);
  if (focusTimer) clearTimeout(focusTimer);
  focusTimer = undefined;
  unsubscribe?.();
});
</script>

<style scoped lang="less">
.nh-knowledge {
  width: min(860px, calc(100vw - 48px));
}

.nh-knowledge__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.nh-knowledge__intro {
  min-width: 0;
}

.nh-knowledge__header p {
  margin: 0;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-knowledge__limit {
  margin-top: 4px !important;
  color: var(--nh-color-text-disabled) !important;
  font-size: 10px !important;
}

.nh-knowledge__actions {
  display: flex;
  flex: none;
  gap: 6px;
}

.nh-knowledge__scan {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--nh-color-accent) 24%, var(--nh-border-subtle));
  border-radius: 8px;
  background: color-mix(in srgb, var(--nh-color-accent) 5%, var(--nh-surface-elevated));
}

.nh-knowledge__scan-copy {
  min-width: 0;
}

.nh-knowledge__scan-copy strong {
  color: var(--nh-color-text-primary);
  font-size: 12px;
}

.nh-knowledge__scan-copy p {
  margin: 3px 0 0;
  color: var(--nh-color-text-secondary);
  font-size: 11px;
}

.nh-knowledge__scan-skipped {
  overflow: hidden;
  color: var(--nh-color-warning) !important;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-knowledge__scan-path {
  overflow: hidden;
  color: var(--nh-color-text-disabled) !important;
  font-family: var(--nh-font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-knowledge__scan-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 6px;
}

.nh-knowledge__list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 14px 0 8px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-knowledge__count {
  color: var(--nh-color-text-disabled);
  font-family: var(--nh-font-mono);
  font-size: 10px;
}

.nh-knowledge__loading,
.nh-knowledge__empty {
  display: flex;
  min-height: 220px;
  align-items: center;
  justify-content: center;
  padding: 28px;
  border: 1px dashed var(--nh-border-subtle);
  border-radius: 12px;
}

.nh-knowledge__empty :deep(.n-empty__icon) {
  opacity: 0.72;
}

.nh-knowledge__empty :deep(.n-empty__description) {
  margin-top: 8px;
  color: color-mix(in srgb, var(--nh-color-text-secondary) 72%, transparent);
  font-size: 13px;
}

.nh-knowledge__empty-hint {
  margin: 6px 0 0;
  color: var(--nh-color-text-disabled);
  font-size: 12px;
}

.nh-knowledge__list {
  display: flex;
  max-height: min(380px, 42vh);
  flex-direction: column;
  gap: 8px;
  overflow: auto;
}
</style>
