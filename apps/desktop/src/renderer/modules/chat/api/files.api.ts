/**
 * 输出文件 API：另存为。
 */

import type { FileSaveAsResult } from '@shared/ipc/contracts';
import { unwrap } from '@/app/ipc';

/**
 * 通过系统对话框另存文件。
 */
export const saveOutputFileAs = async (
  sessionId: string,
  fileId: string
): Promise<FileSaveAsResult> => unwrap(await window.nexus.files.saveAs({ sessionId, fileId }));
