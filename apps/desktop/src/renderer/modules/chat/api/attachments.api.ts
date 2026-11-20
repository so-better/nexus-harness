/**
 * 附件 API：粘贴/拖拽文件上传与移除。
 */
import { nexus } from '@/app/nexus-bridge';
import type { MessageAttachment } from '@shared/events';
import { unwrap } from '@/app/ipc';

const fileToBase64 = async (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });

export const uploadAttachment = async (
  sessionId: string,
  file: File
): Promise<MessageAttachment> =>
  unwrap(
    await nexus.attachments.upload({
      sessionId,
      name: file.name || `pasted-${Date.now()}`,
      mime: file.type || undefined,
      base64: await fileToBase64(file)
    })
  );

export const readAttachmentImage = async (
  sessionId: string,
  attachmentId: string
): Promise<{ mime: string; base64: string }> =>
  unwrap(await nexus.attachments.read({ sessionId, attachmentId }));

export const removeAttachment = async (
  sessionId: string,
  attachmentId: string
): Promise<void> => {
  unwrap(await nexus.attachments.remove({ sessionId, attachmentId }));
};
