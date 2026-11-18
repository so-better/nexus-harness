/**
 * 检查点 API：读取 diff 与恢复文件。
 */

import type { CheckpointDiffResult, CheckpointRestoreResult } from '@shared/ipc/contracts';
import { unwrap } from '@/app/ipc';

/**
 * 读取检查点的修改前后文本。
 */
export const getCheckpointDiff = async (
  sessionId: string,
  checkpointId: string
): Promise<CheckpointDiffResult> =>
  unwrap(await window.nexus.checkpoint.diff({ sessionId, checkpointId }));

/**
 * 恢复单个检查点。
 */
export const restoreCheckpoint = async (
  sessionId: string,
  checkpointId: string
): Promise<CheckpointRestoreResult> =>
  unwrap(await window.nexus.checkpoint.restore({ sessionId, checkpointId }));

/**
 * 用系统默认应用打开检查点文件。
 */
export const openCheckpointFile = async (
  sessionId: string,
  checkpointId: string
): Promise<{ opened: boolean }> =>
  unwrap(await window.nexus.checkpoint.openFile({ sessionId, checkpointId }));
