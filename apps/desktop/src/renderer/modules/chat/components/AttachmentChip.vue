<template>
  <span class="nh-file-chip nh-file-chip--attachment" :title="attachment.name">
    <span class="nh-file-chip__glyph">
      <AppIcon name="paperclip" :size="13" />
    </span>
    <span class="nh-file-chip__name">{{ attachment.name }}</span>
    <span class="nh-file-chip__meta">{{ sizeLabel }}</span>
    <NImage
      v-if="isImage && imageSrc"
      class="nh-file-chip__preview"
      :width="20"
      :height="20"
      object-fit="cover"
      :src="imageSrc"
      :alt="attachment.name"
      @error="imageSrc = ''"
    />
    <button
      v-if="removable"
      type="button"
      class="nh-file-chip__remove"
      :aria-label="t('chat.attachmentRemove')"
      @click.stop="emit('remove')"
    >
      <AppIcon name="close" :size="12" />
    </button>
  </span>
</template>

<script setup lang="ts">
/**
 * 用户附件 chip：与 @ 引用保持相同布局，使用回形针图标、大小与图片尾部缩略图。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { NImage } from 'naive-ui';
import type { MessageAttachment } from '@shared/events';
import { isImageFile } from '@shared/files';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import { readAttachmentImage } from '../api/attachments.api';
import { getImagePreview } from '../image-preview-cache';

const props = defineProps<{
  attachment: MessageAttachment;
  removable?: boolean;
}>();

const emit = defineEmits<{ remove: [] }>();

const imageSrc = ref('');
const isImage = computed(
  () =>
    props.attachment.mime.toLowerCase().startsWith('image/') || isImageFile(props.attachment.name)
);

const sizeLabel = computed(() => {
  const bytes = props.attachment.bytes;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
});

const loadPreview = async (): Promise<void> => {
  imageSrc.value = '';
  if (!isImage.value) return;
  try {
    const result = await getImagePreview(
      `attachment:${props.attachment.sessionId}:${props.attachment.id}`,
      () => readAttachmentImage(props.attachment.sessionId, props.attachment.id)
    );
    imageSrc.value = `data:${result.mime};base64,${result.base64}`;
  } catch {
    // 图片预览失败时回退为图标，不影响附件本身发送
  }
};

onMounted(() => {
  loadPreview().catch((error: unknown) => {
    console.error('加载附件预览失败', error);
  });
});

watch(
  () => [props.attachment.id, props.attachment.sessionId, isImage.value],
  () => {
    loadPreview().catch((error: unknown) => {
      console.error('加载附件预览失败', error);
    });
  }
);
</script>

<style scoped lang="less" src="./FileChip.less"></style>
