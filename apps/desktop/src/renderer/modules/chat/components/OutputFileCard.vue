<template>
  <div class="nh-output-file">
    <span class="nh-output-file__icon">
      <AppIcon name="file" :size="16" />
    </span>
    <span class="nh-output-file__copy">
      <span class="nh-output-file__name">{{ file.name }}</span>
      <span class="nh-output-file__meta">{{ formatBytes(file.bytes) }} · {{ file.mime }}</span>
    </span>
    <span class="nh-output-file__actions">
      <NButton text size="tiny" :loading="loadingPreview" @click="openPreview">{{
        t('file.preview')
      }}</NButton>
      <NButton text size="tiny" :loading="saving" @click="saveAs">{{ t('file.saveAs') }}</NButton>
    </span>

    <NModal v-model:show="showPreview" preset="card" class="nh-file-preview" :title="file.name">
      <div class="nh-file-preview__body">
        <img v-if="isImage && previewUrl" :src="previewUrl" :alt="file.name" />
        <iframe
          v-else-if="isPdf && previewUrl"
          class="nh-file-preview__pdf"
          :src="previewUrl"
          :title="file.name"
        />
        <pre v-else-if="previewText !== undefined">{{ previewText }}</pre>
        <p v-else class="nh-file-preview__hint">{{ t('file.previewUnsupported') }}</p>
      </div>
    </NModal>
  </div>
</template>

<script setup lang="ts">
/**
 * 输出文件卡片：预览与另存为。
 */

import { computed, ref } from 'vue';
import { NButton, NModal, useMessage } from 'naive-ui';
import type { OutputFile } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import { readOutputFile, saveOutputFileAs } from '../api/files.api';

const props = defineProps<{ file: OutputFile }>();
const message = useMessage();
const loadingPreview = ref(false);
const saving = ref(false);
const showPreview = ref(false);
const previewUrl = ref('');
const previewText = ref<string | undefined>();

const isImage = computed(() => props.file.mime.startsWith('image/'));
const isPdf = computed(() => props.file.mime === 'application/pdf');
const isText = computed(
  () =>
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
 * 解码文本 data URL，供 monospace 预览。
 */
const decodeDataUrl = (dataUrl: string): string => {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
};

/**
 * 加载并展示预览。
 */
const openPreview = async (): Promise<void> => {
  if (!previewUrl.value) {
    loadingPreview.value = true;
    try {
      const result = await readOutputFile(props.file.sessionId, props.file.id);
      previewUrl.value = result.dataUrl;
      previewText.value = isText.value ? decodeDataUrl(result.dataUrl) : undefined;
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('file.previewFailed'));
      return;
    } finally {
      loadingPreview.value = false;
    }
  }
  showPreview.value = true;
};

/**
 * 打开系统保存对话框。
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
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border: 1px solid var(--nh-color-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--nh-color-bg-base) 82%, transparent);
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

.nh-output-file__actions {
  display: flex;
  flex: none;
  gap: 8px;
}

.nh-file-preview__body {
  max-height: 70vh;
  overflow: auto;
}

.nh-file-preview__body img {
  display: block;
  max-width: 100%;
  margin: 0 auto;
}

.nh-file-preview__pdf {
  width: 100%;
  height: 70vh;
  border: 0;
}

.nh-file-preview__body pre {
  margin: 0;
  font-family: var(--nh-font-mono);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.nh-file-preview__hint {
  color: var(--nh-color-text-secondary);
}
</style>
