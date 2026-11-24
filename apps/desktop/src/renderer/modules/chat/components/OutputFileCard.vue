<template>
  <div class="nh-output-file">
    <div class="nh-output-file__row">
      <span class="nh-output-file__icon">
        <AppIcon name="file" :size="16" />
      </span>
      <span class="nh-output-file__copy">
        <span class="nh-output-file__name">{{ file.name }}</span>
        <span class="nh-output-file__meta"
          >{{ formatFileBytes(file.bytes) }} · {{ file.mime }}</span
        >
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
      <span class="nh-output-file__actions">
        <NButton v-if="canPreview" quaternary size="small" @click="previewOpen = true">
          <template #icon>
            <AppIcon name="eye" :size="14" />
          </template>
          {{ t('file.preview') }}
        </NButton>
        <NButton type="primary" quaternary size="small" :loading="saving" @click="saveAs(file)">
          <template #icon>
            <AppIcon name="download" :size="14" />
          </template>
          {{ t('file.saveAs') }}
        </NButton>
      </span>
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
 * 输出文件卡片：可按类型预览可读内容，另存为通过系统对话框。
 */

import { computed, ref } from 'vue';
import { NButton } from 'naive-ui';
import type { OutputFile } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import PluginSlot from '@/plugin-runtime/components/PluginSlot.vue';
import { formatFileBytes } from '../file-format';
import { useOutputFileSave } from '../use-output-file-save';
import FilePreviewModal from './FilePreviewModal.vue';

const props = defineProps<{ file: OutputFile }>();
const { saving, saveAs } = useOutputFileSave();
const previewOpen = ref(false);
const canPreview = computed(() => {
  const mime = props.file.mime.toLowerCase();
  return (
    mime === 'image/svg+xml' ||
    mime === 'text/html' ||
    mime === 'application/xhtml+xml' ||
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml'
  );
});
</script>

<style scoped lang="less">
.nh-output-file {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 10px;
  background: var(--nh-surface-base);
}

.nh-output-file__row {
  display: flex;
  align-items: center;
  gap: 9px;
}

.nh-output-file__actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 2px;
}

.nh-output-file__icon {
  display: grid;
  width: 30px;
  height: 30px;
  flex: none;
  place-items: center;
  border-radius: 8px;
  background: var(--nh-surface-elevated);
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
