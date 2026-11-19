<template>
  <div class="nh-output-file">
    <div class="nh-output-file__row">
      <span class="nh-output-file__icon">
        <AppIcon name="file" :size="16" />
      </span>
      <span class="nh-output-file__copy">
        <span class="nh-output-file__name">{{ file.name }}</span>
        <span class="nh-output-file__meta">{{ formatBytes(file.bytes) }} · {{ file.mime }}</span>
      </span>
      <PluginSlot
        location="filecard.actions"
        :context="{
          location: 'filecard.actions',
          sessionId: file.sessionId,
          runId: file.runId,
          fileId: file.id
        }"
      />
      <NButton v-if="canPreview" text size="tiny" @click="previewOpen = true">
        {{ t('file.preview') }}
      </NButton>
      <NButton text size="tiny" :loading="saving" @click="saveAs">
        {{ t('file.saveAs') }}
      </NButton>
    </div>
    <PluginSlot
      location="filecard.footer"
      :context="{
        location: 'filecard.footer',
        sessionId: file.sessionId,
        runId: file.runId,
        fileId: file.id
      }"
    />
    <FilePreviewModal v-model:show="previewOpen" :file="file" />
  </div>
</template>

<script setup lang="ts">
/**
 * 输出文件卡片：仅负责另存，文件由用户用专业软件打开。
 */

import { computed, ref } from 'vue';
import { NButton, useMessage } from 'naive-ui';
import type { OutputFile } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import PluginSlot from '@/plugin-runtime/components/PluginSlot.vue';
import { saveOutputFileAs } from '../api/files.api';
import FilePreviewModal from './FilePreviewModal.vue';

const props = defineProps<{ file: OutputFile }>();
const message = useMessage();
const saving = ref(false);
const previewOpen = ref(false);
const canPreview = computed(
  () =>
    props.file.mime.startsWith('image/') ||
    props.file.mime === 'text/html' ||
    props.file.mime === 'application/xhtml+xml' ||
    props.file.mime.startsWith('text/') ||
    props.file.mime === 'application/json' ||
    props.file.mime === 'application/xml'
);

/**
 * 格式化文件体积。
 */
const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/**
 * 打开系统保存对话框，由用户决定后续用哪个软件打开。
 */
const saveAs = async (): Promise<void> => {
  saving.value = true;
  try {
    const result = await saveOutputFileAs(props.file.sessionId, props.file.id);
    if (result.saved) message.success(t('file.saved'));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('file.saveFailed'));
  } finally {
    saving.value = false;
  }
};
</script>

<style scoped lang="less">
.nh-output-file {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 10px;
  background: color-mix(in srgb, var(--nh-color-bg-base) 82%, transparent);
}

.nh-output-file__row {
  display: flex;
  align-items: center;
  gap: 9px;
}

.nh-output-file__icon {
  display: grid;
  width: 30px;
  height: 30px;
  flex: none;
  place-items: center;
  border-radius: 8px;
  background: var(--nh-color-bg-hover);
  color: var(--nh-color-text-secondary);
}

.nh-output-file__copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 1px;
}

.nh-output-file__name {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-output-file__meta {
  color: var(--nh-color-text-secondary);
  font-size: 11px;
}
</style>
