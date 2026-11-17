/* 检查点 IPC：按会话与检查点 ID 恢复文件。 */

import { ipcMain } from 'electron';
import { createNexusEvent } from '@nexus/core';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { checkpointRestoreInputSchema, type CheckpointRestoreResult } from '@shared/ipc/contracts';
import { fail, ok, type Result } from '@shared/ipc/result';
import { CheckpointService } from '../services/checkpoint/checkpoint-service';
import { EventStore } from '../services/session/event-store';
import { getDatabase } from '../services/storage/database';

/* 注册 checkpoint:restore。 */
export const registerCheckpointIpc = (): void => {
  const checkpoints = new CheckpointService();
  const events = new EventStore(getDatabase());

  ipcMain.handle(
    IPC_CHANNELS.checkpointRestore,
    async (_event, rawInput: unknown): Promise<Result<CheckpointRestoreResult>> => {
      const parsed = checkpointRestoreInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return fail('CHECKPOINT_INVALID_INPUT', '检查点参数不合法', parsed.error.flatten());
      }

      try {
        const restored = await checkpoints.restore(parsed.data.sessionId, parsed.data.checkpointId);
        events.append(
          createNexusEvent({
            sessionId: parsed.data.sessionId,
            seq: 1,
            type: 'checkpoint.restored',
            payload: { checkpointId: parsed.data.checkpointId }
          })
        );
        return ok({ checkpointId: parsed.data.checkpointId, restored });
      } catch (error) {
        return fail(
          'CHECKPOINT_RESTORE_FAILED',
          error instanceof Error ? error.message : '恢复检查点失败'
        );
      }
    }
  );
};
