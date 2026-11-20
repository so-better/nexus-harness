/**
 * 输入区附件：校验、上传、移除与发送后的清理。
 */
import { computed, ref, type Ref } from 'vue';
import { useMessage } from 'naive-ui';
import type { MessageAttachment } from '@shared/events';
import { t } from '@/app/i18n';
import { removeAttachment, uploadAttachment } from './api/attachments.api';

const MAX_ATTACHMENTS = 8;
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
const MAX_IMAGES = 4;

interface ComposerAttachmentOptions {
  sessionId: Ref<string | undefined>;
  ensureSession: () => Promise<string | undefined>;
  disabled: Ref<boolean>;
  running: Ref<boolean>;
}

export const useComposerAttachments = (options: ComposerAttachmentOptions) => {
  const message = useMessage();
  const attachments = ref<MessageAttachment[]>([]);
  const uploading = ref(false);
  const hasAttachments = computed(() => attachments.value.length > 0);

  const isImage = (attachment: MessageAttachment): boolean =>
    attachment.mime.toLowerCase().startsWith('image/');

  const addFiles = async (files: File[]): Promise<void> => {
    if (options.disabled.value || options.running.value || uploading.value || !files.length) return;
    const room = MAX_ATTACHMENTS - attachments.value.length;
    if (room <= 0) {
      message.warning(t('chat.attachmentLimit'));
      return;
    }
    uploading.value = true;
    try {
      const sessionId = options.sessionId.value ?? (await options.ensureSession());
      if (!sessionId) return;
      let imageCount = attachments.value.filter(isImage).length;
      for (const file of files.slice(0, room)) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          message.warning(t('chat.attachmentSizeLimit'));
          continue;
        }
        if (file.type.startsWith('image/') && imageCount >= MAX_IMAGES) {
          message.warning(t('chat.attachmentImageLimit'));
          continue;
        }
        try {
          const attachment = await uploadAttachment(sessionId, file);
          attachments.value = [...attachments.value, attachment];
          if (isImage(attachment)) imageCount += 1;
        } catch (reason) {
          message.error(reason instanceof Error ? reason.message : t('chat.attachmentUploadFailed'));
        }
      }
    } finally {
      uploading.value = false;
    }
  };

  const remove = async (attachment: MessageAttachment): Promise<void> => {
    try {
      await removeAttachment(attachment.sessionId, attachment.id);
      attachments.value = attachments.value.filter((item) => item.id !== attachment.id);
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : t('chat.attachmentUploadFailed'));
    }
  };

  const detach = (attachmentId: string): void => {
    attachments.value = attachments.value.filter((item) => item.id !== attachmentId);
  };

  const clear = (): void => {
    attachments.value = [];
  };

  const setAttachments = (items: MessageAttachment[]): void => {
    attachments.value = [...items];
  };

  return { attachments, uploading, hasAttachments, addFiles, remove, detach, clear, setAttachments };
};
