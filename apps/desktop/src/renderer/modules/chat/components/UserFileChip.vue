<template>
  <span
    class="nh-file-chip nh-file-chip--reference"
    :title="tooltip ?? file.path"
    :aria-label="t('chat.fileReference') + ' ' + file.name"
  >
    <span class="nh-file-chip__glyph">
      <span class="nh-file-chip__at" aria-hidden="true">@</span>
    </span>
    <span class="nh-file-chip__name">{{ file.name }}</span>
    <span v-if="file.bytes !== undefined" class="nh-file-chip__meta">{{ sizeLabel }}</span>
    <NImage
      v-if="imageSrc"
      class="nh-file-chip__preview"
      :width="20"
      :height="20"
      object-fit="cover"
      :src="imageSrc"
      :alt="file.name"
      @error="imageSrc = ''"
    />
    <button
      v-if="removable"
      type="button"
      class="nh-file-chip__remove"
      :aria-label="t('chat.fileReferenceRemove')"
      @click.stop="emit('remove')"
    >
      <AppIcon name="close" :size="12" />
    </button>
  </span>
</template>

<script setup lang="ts">
/**
 * @ 工作区文件引用 chip：保留路径语义，使用 @ 标记、大小与图片尾部缩略图。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { NImage } from 'naive-ui';
import { isImageFile } from '@shared/files';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import { readWorkspaceImage } from '../api/workspace.api';
import { getImagePreview } from '../image-preview-cache';

const props = defineProps<{
  file: { path: string; name: string; bytes?: number | undefined };
  sessionId?: string | undefined;
  isImage?: boolean | undefined;
  removable?: boolean;
  tooltip?: string;
}>();

const emit = defineEmits<{ remove: [] }>();
const imageSrc = ref('');
const showImage = computed(() => Boolean(props.isImage) || isImageFile(props.file.name));
const sizeLabel = computed(() => {
  const bytes = props.file.bytes;
  if (bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
});

/**
 * 在工作区 root 内读取图片缩略图；失败时回退为文件图标，不影响引用发送。
 */
const loadPreview = async (): Promise<void> => {
  imageSrc.value = '';
  if (!showImage.value || !props.sessionId) return;
  try {
    const result = await getImagePreview(`workspace:${props.sessionId}:${props.file.path}`, () =>
      readWorkspaceImage(props.sessionId!, props.file.path)
    );
    imageSrc.value = `data:${result.mime};base64,${result.base64}`;
  } catch {
    // 非授权、文件移动或超限时保留普通引用样式
  }
};

onMounted(() => {
  loadPreview().catch((error: unknown) => {
    console.error('加载图片预览失败', error);
  });
});

watch(
  () => [props.file.path, props.sessionId, showImage.value],
  () => {
    loadPreview().catch((error: unknown) => {
      console.error('加载图片预览失败', error);
    });
  }
);
</script>

<style scoped lang="less" src="./FileChip.less"></style>
