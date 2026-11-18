/**
 * 输出文件 API：预览与另存为。
 */

import type { FileReadResult, FileSaveAsResult } from '@shared/ipc/contracts';
import { unwrap } from '@/app/ipc';

/**
 * 读取文件为 data URL。
 */
export const readOutputFile = async (sessionId: string, fileId: string): Promise<FileReadResult> =>
  unwrap(await window.nexus.files.read({ sessionId, fileId }));

/**
 * 通过系统对话框另存文件。
 */
export const saveOutputFileAs = async (
  sessionId: string,
  fileId: string
): Promise<FileSaveAsResult> => unwrap(await window.nexus.files.saveAs({ sessionId, fileId }));
