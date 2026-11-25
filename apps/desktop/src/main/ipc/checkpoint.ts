/**
 * 检查点 IPC：按会话与检查点 ID 恢复文件。
 */

import { ipcMain, shell } from 'electron';
import { realpath } from 'node:fs/promises';
import { sep } from 'node:path';
import { createNexusEvent } from '@nexus/core';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import {
  checkpointDiffInputSchema,
  checkpointOpenInputSchema,
  checkpointRestoreInputSchema,
  type CheckpointDiffResult,
  type CheckpointOpenResult,
  type CheckpointRestoreResult
} from '@shared/ipc/contracts';
import { fail, ok, type Result } from '@shared/ipc/result';
import { CheckpointService } from '../services/checkpoint/checkpoint-service';
import { EventStore } from '../services/session/event-store';
import { getDatabase } from '../services/storage/database';
import { createSessionService } from '../services/session/create-session-service';

/**
 * 注册 checkpoint:restore。
 */
export const registerCheckpointIpc = (): void => {
  const db = getDatabase();
  const checkpoints = new CheckpointService();
  const events = new EventStore(db);
  const sessions = createSessionService(db, events);

  ipcMain.handle(
    IPC_CHANNELS.checkpointDiff,
    async (_event, rawInput: unknown): Promise<Result<CheckpointDiffResult>> => {
      const parsed = checkpointDiffInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return fail('CHECKPOINT_INVALID_INPUT', '检查点参数不合法', parsed.error.flatten());
      }
      try {
        return ok(await checkpoints.diff(parsed.data.sessionId, parsed.data.checkpointId));
      } catch (error) {
        return fail(
          'CHECKPOINT_DIFF_FAILED',
          error instanceof Error ? error.message : '读取检查点 diff 失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.checkpointOpenFile,
    async (_event, rawInput: unknown): Promise<Result<CheckpointOpenResult>> => {
      const parsed = checkpointOpenInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return fail('CHECKPOINT_INVALID_INPUT', '检查点参数不合法', parsed.error.flatten());
      }
      try {
        const filePath = await checkpoints.getFilePath(
          parsed.data.sessionId,
          parsed.data.checkpointId
        );
        const real = await realpath(filePath).catch(() => undefined);
        if (!real) return fail('CHECKPOINT_FILE_MISSING', '文件不存在或已被移动');
        const roots = sessions.listRoots(parsed.data.sessionId).map((root) => root.path);
        const allowed = roots.some((root) => real === root || real.startsWith(`${root}${sep}`));
        if (!allowed) return fail('CHECKPOINT_PATH_DENIED', '文件不在会话授权范围内');
        const error = await shell.openPath(real);
        if (error) return fail('CHECKPOINT_OPEN_FAILED', error);
        return ok({ opened: true });
      } catch (error) {
        return fail(
          'CHECKPOINT_OPEN_FAILED',
          error instanceof Error ? error.message : '打开文件失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.checkpointRestore,
    async (_event, rawInput: unknown): Promise<Result<CheckpointRestoreResult>> => {
      const parsed = checkpointRestoreInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return fail('CHECKPOINT_INVALID_INPUT', '检查点参数不合法', parsed.error.flatten());
      }

      try {
        const restored = await checkpoints.restore(parsed.data.sessionId, parsed.data.checkpointId);
        const stored = events.append(
          createNexusEvent({
            sessionId: parsed.data.sessionId,
            seq: 1,
            type: 'checkpoint.restored',
            payload: { checkpointId: parsed.data.checkpointId }
          })
        );
        if (_event.sender && !_event.sender.isDestroyed()) {
          _event.sender.send(IPC_CHANNELS.agentEvent, stored);
        }
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
