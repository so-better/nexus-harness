<template>
  <div class="nh-artifact">
    <span class="nh-artifact__icon">
      <AppIcon name="file" :size="16" />
    </span>
    <span class="nh-artifact__copy">
      <span class="nh-artifact__name">{{ artifact?.label ?? t('tool.artifactId') }}</span>
      <span class="nh-artifact__meta" :title="error ?? undefined">
        <template v-if="artifact">{{ sizeLabel }} · {{ t('tool.artifactId') }}</template>
        <template v-else-if="loading">…</template>
        <template v-else-if="error">{{ t('tool.artifactLoadFailed') }}</template>
        <template v-else>{{ artifactId }}</template>
      </span>
    </span>
    <span v-if="artifact" class="nh-artifact__actions">
      <NButton type="primary" quaternary size="small" :loading="saving" @click="saveAs">
        <template #icon><AppIcon name="download" :size="14" /></template>
        {{ t('file.saveAs') }}
      </NButton>
    </span>
    <span v-else-if="error" class="nh-artifact__actions">
      <NButton text size="tiny" @click="load">{{ t('tool.artifactRetry') }}</NButton>
    </span>
  </div>
</template>

<script setup lang="ts">
/**
 * 工具产物卡片：读取产物元信息并提供预览与另存为。
 */

import { computed, onMounted, ref, watch } from 'vue';
import { NButton, useMessage } from 'naive-ui';
import type { ArtifactMetaResult } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import { readArtifactMeta, saveArtifactAs } from '../api/artifacts.api';

const props = defineProps<{ sessionId?: string | undefined; artifactId: string }>();

const message = useMessage();
const artifact = ref<ArtifactMetaResult>();
const error = ref<string>();
const loading = ref(false);
const saving = ref(false);

const sizeLabel = computed(() => {
  const bytes = artifact.value?.bytes ?? 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
});

/**
 * 读取产物；失败时回退为只显示 artifactId，不影响工具卡本身。
 */
const load = async (): Promise<void> => {
  if (!props.sessionId) return;
  loading.value = true;
  error.value = undefined;
  try {
    artifact.value = await readArtifactMeta({
      sessionId: props.sessionId,
      artifactId: props.artifactId
    });
  } catch (reason) {
    artifact.value = undefined;
    error.value = reason instanceof Error ? reason.message : t('tool.artifactLoadFailed');
  } finally {
    loading.value = false;
  }
};

/**
 * 通过系统对话框另存产物。
 */
const saveAs = async (): Promise<void> => {
  if (!props.sessionId || !artifact.value || saving.value) return;
  saving.value = true;
  try {
    const result = await saveArtifactAs({
      sessionId: props.sessionId,
      artifactId: props.artifactId
    });
    if (result.saved) message.success(t('file.saved'));
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('file.saveFailed'));
  } finally {
    saving.value = false;
  }
};

onMounted(load);
watch(
  () => [props.sessionId, props.artifactId],
  () => {
    artifact.value = undefined;
    error.value = undefined;
    load().catch((error: unknown) => {
      console.error('加载工具产物失败', error);
    });
  }
);
</script>

<style scoped lang="less">
.nh-artifact {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--nh-border-subtle) 65%, transparent);
  border-radius: 9px;
  background: var(--nh-surface-elevated);
}

.nh-artifact__icon {
  display: grid;
  width: 30px;
  height: 30px;
  flex: none;
  place-items: center;
  border-radius: 8px;
  background: var(--nh-surface-elevated);
  color: var(--nh-color-text-secondary);
}

.nh-artifact__copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 1px;
}

.nh-artifact__name {
  overflow: hidden;
  color: var(--nh-color-text-primary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-artifact__meta {
  overflow: hidden;
  color: var(--nh-color-text-secondary);
  font-family: var(--nh-font-mono);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-artifact__actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 2px;
}
</style>
