<template>
  <div ref="root" class="nh-inline-media" :class="{ 'nh-inline-media--video': isVideo }">
    <div v-if="status === 'idle' || status === 'loading'" class="nh-inline-media__loading">
      <FilePreviewLoading :kind="isVideo ? 'video' : 'image'" />
    </div>
    <div v-else-if="status === 'error'" class="nh-inline-media__error">
      <AppIcon name="alert" :size="20" />
      <div class="nh-inline-media__error-copy">
        <span class="nh-inline-media__error-name">{{ file.name }}</span>
        <span class="nh-inline-media__error-text">{{ error }}</span>
      </div>
      <div class="nh-inline-media__error-actions">
        <NButton size="small" type="primary" secondary @click="retry">
          <template #icon><AppIcon name="refresh" :size="14" /></template>
          {{ t('app.retry') }}
        </NButton>
      </div>
    </div>
    <NImage
      v-else-if="!isVideo"
      class="nh-inline-media__image"
      :src="src"
      :alt="file.name"
      @error="onImageError"
    />
    <video
      v-else
      class="nh-inline-media__video"
      :src="src"
      :aria-label="file.name"
      controls
      playsinline
      preload="metadata"
      @error="onVideoError"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * AI 回复中的图片/视频：进入可视区域后按 fileId 读取，图片使用 NImage 遮罩预览，
 * 视频使用原生 controls；失败时显示可重试的紧凑错误卡片。
 */

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { NButton, NImage } from 'naive-ui';
import type { OutputFile } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import { readOutputFile } from '../api/files.api';
import { registerMediaDownload } from '../media-download';
import { useOutputFileSave } from '../use-output-file-save';
import FilePreviewLoading from './FilePreviewLoading.vue';

const props = defineProps<{ file: OutputFile }>();
const { saveAs } = useOutputFileSave();
const root = ref<HTMLElement | null>(null);
const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const error = ref('');
const src = ref('');
let request = 0;
let objectUrl = '';
let observer: IntersectionObserver | undefined;
let unregisterDownload: (() => void) | undefined;

const isVideo = computed(() => props.file.mime.toLowerCase().startsWith('video/') ?? false);

const release = (): void => {
  unregisterDownload?.();
  unregisterDownload = undefined;
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = '';
  }
  src.value = '';
};

const reset = (): void => {
  release();
  request += 1;
  status.value = 'idle';
  error.value = '';
};

const load = async (): Promise<void> => {
  if (status.value === 'loading' || status.value === 'ready') return;
  const current = ++request;
  release();
  status.value = 'loading';
  error.value = '';
  try {
    const result = await readOutputFile(props.file.sessionId, props.file.id);
    if (current !== request) return;
    if (isVideo.value) {
      const response = await fetch(`data:${props.file.mime};base64,${result.base64}`);
      const blob = await response.blob();
      if (current !== request) return;
      objectUrl = URL.createObjectURL(blob);
      src.value = objectUrl;
    } else {
      // 图片直接使用 data URL，避免 blob/fetch 在部分 CSP 或 IPC 场景下触发加载失败
      src.value = `data:${props.file.mime};base64,${result.base64}`;
    }
    unregisterDownload?.();
    unregisterDownload = registerMediaDownload(src.value, () => saveAs(props.file));
    status.value = 'ready';
  } catch (reason) {
    if (current !== request) return;
    status.value = 'error';
    error.value = reason instanceof Error ? reason.message : t('file.previewLoadFailed');
  }
};

const retry = (): void => {
  reset();
  load().catch(() => undefined);
};

const onImageError = (): void => {
  release();
  status.value = 'error';
  error.value = t('file.previewRenderFailed');
};

const onVideoError = (): void => {
  release();
  status.value = 'error';
  error.value = t('file.previewPlaybackFailed');
};

watch(
  () => props.file.id,
  () => {
    reset();
    observer?.disconnect();
    observer = undefined;
    observe();
  }
);

const observe = (): void => {
  if (!root.value) return;
  if (!('IntersectionObserver' in window)) {
    load().catch(() => undefined);
    return;
  }
  observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer?.disconnect();
      load().catch(() => undefined);
    },
    { rootMargin: '200px' }
  );
  observer.observe(root.value);
};

onMounted(observe);

onBeforeUnmount(() => {
  observer?.disconnect();
  release();
});
</script>

<style scoped lang="less" src="./InlineMediaFile.less"></style>

