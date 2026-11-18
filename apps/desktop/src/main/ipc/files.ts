/**
 * 文件 IPC：输出文件另存为。
 */

import { dialog, ipcMain } from 'electron';
import { fileSaveAsInputSchema, type FileSaveAsResult } from '@shared/ipc/contracts';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { fail, ok, type Result } from '@shared/ipc/result';
import { FileService } from '../services/files/file-service';
import { getDatabase } from '../services/storage/database';

/**
 * 注册 files:saveAs。
 */
export const registerFilesIpc = (): void => {
  const db = getDatabase();
  const files = new FileService(db);
  const sessionExists = (sessionId: string): boolean =>
    Boolean(
      db.prepare('SELECT 1 FROM sessions WHERE id = ? AND deleted_at IS NULL').get(sessionId)
    );

  ipcMain.handle(
    IPC_CHANNELS.filesSaveAs,
    async (_event, rawInput: unknown): Promise<Result<FileSaveAsResult>> => {
      const parsed = fileSaveAsInputSchema.safeParse(rawInput);
      if (!parsed.success) return fail('FILES_INVALID_INPUT', '文件参数不合法');
      if (!sessionExists(parsed.data.sessionId)) {
        return fail('SESSION_NOT_FOUND', '会话不存在');
      }
      const meta = files.getMeta(parsed.data.fileId, parsed.data.sessionId);
      if (!meta) return fail('FILE_NOT_FOUND', '文件不存在');

      const result = await dialog.showSaveDialog({
        title: '另存为',
        defaultPath: meta.name
      });
      if (result.canceled || !result.filePath) {
        return ok({ fileId: meta.id, saved: false });
      }
      try {
        await files.saveAs(meta.id, parsed.data.sessionId, result.filePath);
        return ok({ fileId: meta.id, saved: true, path: result.filePath });
      } catch (error) {
        return fail('FILE_SAVE_FAILED', error instanceof Error ? error.message : '保存文件失败');
      }
    }
  );
};
