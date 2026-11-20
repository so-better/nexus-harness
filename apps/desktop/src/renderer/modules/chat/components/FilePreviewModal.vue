<template>
  <NModal
    :show="show"
    preset="card"
    :title="file?.name ?? t('file.preview')"
    :bordered="false"
    style="width: min(920px, calc(100vw - 48px))"
    @update:show="emit('update:show', $event)"
  >
    <FilePreviewLoading v-if="loading" kind="text" />
    <div v-else-if="error" class="nh-file-preview__state nh-file-preview__state--error">
      {{ error }}
    </div>
    <MonacoEditor
      v-else
      class="nh-file-preview__editor"
      :model-value="text"
      :language="language"
      height="70vh"
      readonly
    />
  </NModal>
</template>

<script setup lang="ts">
/**
 * 文本类输出文件预览：Markdown、JSON、XML、HTML、SQL 等统一用只读 Monaco 源码展示；
 * HTML/SVG 不执行，不把文件路径暴露给渲染层。
 */

import { computed, defineAsyncComponent, ref, watch } from 'vue';
import { NModal } from 'naive-ui';
import type { OutputFile } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import { readOutputFile } from '../api/files.api';
import FilePreviewLoading from './FilePreviewLoading.vue';

const MonacoEditor = defineAsyncComponent(() => import('@/components/MonacoEditor.vue'));

const props = defineProps<{
  show: boolean;
  file: OutputFile | null;
}>();

const emit = defineEmits<{ 'update:show': [show: boolean] }>();
const MAX_TEXT_PREVIEW_BYTES = 5 * 1024 * 1024;
const loading = ref(false);
const error = ref('');
const text = ref('');

const language = computed(() => {
  const mime = props.file?.mime ?? '';
  const name = props.file?.name.toLowerCase() ?? '';
  if (mime === 'application/json' || name.endsWith('.json')) return 'json';
  if (mime === 'application/xml' || mime === 'image/svg+xml' || name.endsWith('.xml')) return 'xml';
  if (mime === 'text/html' || name.endsWith('.html')) return 'html';
  if (mime === 'text/css' || name.endsWith('.css')) return 'css';
  if (mime === 'text/markdown' || name.endsWith('.md')) return 'markdown';
  if (mime === 'text/javascript' || name.endsWith('.js')) return 'javascript';
  if (mime === 'text/typescript' || name.endsWith('.ts')) return 'typescript';
  if (mime === 'text/x-python' || name.endsWith('.py')) return 'python';
  if (mime === 'text/x-shellscript' || name.endsWith('.sh')) return 'shell';
  if (mime === 'text/sql' || name.endsWith('.sql')) return 'sql';
  if (mime === 'text/yaml' || name.endsWith('.yaml') || name.endsWith('.yml')) return 'yaml';
  return 'plaintext';
});

let request = 0;

const load = async (): Promise<void> => {
  if (!props.show || !props.file) return;
  const current = ++request;
  const file = props.file;
  if (file.bytes > MAX_TEXT_PREVIEW_BYTES) {
    error.value = t('file.previewTooLarge');
    text.value = '';
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = '';
  text.value = '';
  try {
    const result = await readOutputFile(file.sessionId, file.id);
    // 用户在加载期间切换文件时，丢弃旧请求的结果
    if (current !== request) return;
    const bytes = Uint8Array.from(atob(result.base64), (char) => char.charCodeAt(0));
    text.value = new TextDecoder().decode(bytes);
  } catch (reason) {
    if (current !== request) return;
    error.value = reason instanceof Error ? reason.message : t('file.previewLoadFailed');
  } finally {
    if (current === request) loading.value = false;
  }
};

watch(() => [props.show, props.file?.id] as const, load, { immediate: true });
</script>

<style scoped lang="less">
.nh-file-preview__state {
  padding: 40px 16px;
  color: var(--nh-color-text-secondary);
  text-align: center;
}

.nh-file-preview__state--error {
  color: var(--nh-color-danger);
}

.nh-file-preview__editor {
  width: 100%;
}
</style>
