/**
 * 输出文件 API：另存为。
 */

import { nexus } from '@/app/nexus-bridge';
import type { FileReadResult, FileSaveAsResult } from '@shared/ipc/contracts';
import { unwrap } from '@/app/ipc';

/**
 * 通过系统对话框另存文件。
 */
export const saveOutputFileAs = async (
  sessionId: string,
  fileId: string
): Promise<FileSaveAsResult> => unwrap(await nexus.files.saveAs({ sessionId, fileId }));

/**
 * 读取输出文件用于预览。
 */
export const readOutputFile = async (sessionId: string, fileId: string): Promise<FileReadResult> =>
  unwrap(await nexus.files.read({ sessionId, fileId }));
