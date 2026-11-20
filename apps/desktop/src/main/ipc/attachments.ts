/**
 * 附件 IPC：粘贴/拖拽/选择文件上传与移除。
 */
import { ipcMain } from 'electron';
import {
  attachmentReadInputSchema,
  attachmentRemoveInputSchema,
  attachmentUploadInputSchema,
  MAX_ATTACHMENT_BASE64_LENGTH,
  type AttachmentPreviewResult
} from '@shared/ipc/contracts';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { fail, ok, type Result } from '@shared/ipc/result';
import type { MessageAttachment } from '@shared/events';
import { AttachmentService } from '../services/attachments/attachment-service';
import { getDatabase } from '../services/storage/database';
import { imageMimeForName } from '@shared/files';

const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_SESSION = 200;
const MAX_PREVIEW_BYTES = 8 * 1024 * 1024;

export const registerAttachmentsIpc = (): void => {
  const db = getDatabase();
  const attachments = new AttachmentService(db);
  const sessionExists = (sessionId: string): boolean =>
    Boolean(db.prepare('SELECT 1 FROM sessions WHERE id = ? AND deleted_at IS NULL').get(sessionId));

  ipcMain.handle(
    IPC_CHANNELS.attachmentsUpload,
    async (_event, rawInput: unknown): Promise<Result<MessageAttachment>> => {
      const parsed = attachmentUploadInputSchema.safeParse(rawInput);
      if (!parsed.success) return fail('ATTACHMENT_INVALID_INPUT', '附件参数不合法');
      if (!sessionExists(parsed.data.sessionId)) return fail('SESSION_NOT_FOUND', '会话不存在');
      const storedCount = db
        .prepare('SELECT COUNT(*) AS count FROM attachments WHERE session_id = ?')
        .get(parsed.data.sessionId) as { count: number };
      if (Number(storedCount.count) >= MAX_ATTACHMENTS_PER_SESSION) {
        return fail('ATTACHMENT_LIMIT_REACHED', '会话附件数量已达上限');
      }
      if (parsed.data.base64.length > MAX_ATTACHMENT_BASE64_LENGTH) {
        return fail('ATTACHMENT_TOO_LARGE', '附件超过 50MB');
      }
      let bytes: Buffer;
      try {
        bytes = Buffer.from(parsed.data.base64, 'base64');
      } catch {
        return fail('ATTACHMENT_INVALID_INPUT', '附件内容不合法');
      }
      if (bytes.byteLength === 0) return fail('ATTACHMENT_INVALID_INPUT', '附件内容为空');
      if (bytes.byteLength > MAX_ATTACHMENT_BYTES) return fail('ATTACHMENT_TOO_LARGE', '附件超过 50MB');
      try {
        return ok(await attachments.save({
          sessionId: parsed.data.sessionId,
          name: parsed.data.name,
          mime:
            (parsed.data.mime && parsed.data.mime !== 'application/octet-stream'
              ? parsed.data.mime
              : imageMimeForName(parsed.data.name)) ?? 'application/octet-stream',
          content: bytes
        }));
      } catch (error) {
        return fail('ATTACHMENT_SAVE_FAILED', error instanceof Error ? error.message : '保存附件失败');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.attachmentsRead,
    async (_event, rawInput: unknown): Promise<Result<AttachmentPreviewResult>> => {
      const parsed = attachmentReadInputSchema.safeParse(rawInput);
      if (!parsed.success) return fail('ATTACHMENT_INVALID_INPUT', '附件参数不合法');
      const found = attachments.get(parsed.data.attachmentId, parsed.data.sessionId);
      if (!found) return fail('ATTACHMENT_NOT_FOUND', '附件不存在');
      const mime = found.mime.toLowerCase().startsWith('image/')
        ? found.mime
        : imageMimeForName(found.name);
      if (!mime) return fail('ATTACHMENT_NOT_IMAGE', '附件不是图片');
      if (found.bytes > MAX_PREVIEW_BYTES) {
        return fail('ATTACHMENT_TOO_LARGE', '图片过大，无法预览');
      }
      try {
        const stored = await attachments.read(parsed.data.attachmentId, parsed.data.sessionId);
        if (!stored) return fail('ATTACHMENT_NOT_FOUND', '附件不存在');
        return ok({ mime, base64: stored.base64 });
      } catch (error) {
        return fail('ATTACHMENT_READ_FAILED', error instanceof Error ? error.message : '读取附件失败');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.attachmentsRemove,
    async (_event, rawInput: unknown): Promise<Result<{ removed: boolean }>> => {
      const parsed = attachmentRemoveInputSchema.safeParse(rawInput);
      if (!parsed.success) return fail('ATTACHMENT_INVALID_INPUT', '附件参数不合法');
      try {
        return ok({ removed: await attachments.remove(parsed.data.attachmentId, parsed.data.sessionId) });
      } catch (error) {
        return fail('ATTACHMENT_REMOVE_FAILED', error instanceof Error ? error.message : '移除附件失败');
      }
    }
  );
};
