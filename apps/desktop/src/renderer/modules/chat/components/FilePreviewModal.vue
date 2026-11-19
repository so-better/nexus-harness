<template>
  <NModal
    :show="show"
    preset="card"
    :title="file?.name ?? t('file.preview')"
    :bordered="false"
    style="width: min(920px, calc(100vw - 48px))"
    @update:show="emit('update:show', $event)"
  >
    <div v-if="loading" class="nh-file-preview__state">{{ t('common.loading') }}</div>
    <div v-else-if="error" class="nh-file-preview__state nh-file-preview__state--error">
      {{ error }}
    </div>
    <img
      v-else-if="kind === 'image'"
      class="nh-file-preview__image"
      :src="dataUrl"
      :alt="file?.name ?? ''"
    />
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
 * 输出文件预览：图片、HTML 沙箱和纯文本，不把文件路径暴露给渲染层。
 */

import { computed, defineAsyncComponent, ref, watch } from 'vue';
import { NModal } from 'naive-ui';
import type { OutputFile } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import { readOutputFile } from '../api/files.api';

const MonacoEditor = defineAsyncComponent(() => import('@/components/MonacoEditor.vue'));

const props = defineProps<{
  show: boolean;
  file: OutputFile | null;
}>();

const emit = defineEmits<{ 'update:show': [show: boolean] }>();
const MAX_TEXT_PREVIEW_BYTES = 5 * 1024 * 1024;
const loading = ref(false);
const error = ref('');
const base64 = ref('');
const text = ref('');

const kind = computed<'image' | 'text'>(() => {
  const mime = props.file?.mime ?? '';
  return mime.startsWith('image/') && mime !== 'image/svg+xml' ? 'image' : 'text';
});

const dataUrl = computed(() =>
  props.file ? `data:${props.file.mime};base64,${base64.value}` : ''
);

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

const load = async (): Promise<void> => {
  if (!props.show || !props.file) return;
  if (kind.value === 'text' && props.file.bytes > MAX_TEXT_PREVIEW_BYTES) {
    error.value = t('file.previewTooLarge');
    base64.value = '';
    text.value = '';
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = '';
  base64.value = '';
  text.value = '';
  try {
    const result = await readOutputFile(props.file.sessionId, props.file.id);
    base64.value = result.base64;
    if (kind.value === 'text') {
      const bytes = Uint8Array.from(atob(result.base64), (char) => char.charCodeAt(0));
      text.value = new TextDecoder().decode(bytes);
    }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : t('file.previewLoadFailed');
  } finally {
    loading.value = false;
  }
};

watch(() => [props.show, props.file?.id] as const, load);
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

.nh-file-preview__image {
  display: block;
  max-width: 100%;
  max-height: 70vh;
  margin: 0 auto;
  object-fit: contain;
}

.nh-file-preview__editor {
  width: 100%;
}
</style>
