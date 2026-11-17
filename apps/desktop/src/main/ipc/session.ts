/* 会话 IPC：列表、创建、读取、重命名与删除。 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import {
  sessionCreateInputSchema,
  sessionRenameInputSchema,
  sessionSetPinnedInputSchema,
  type SessionRemoveResult,
  type SessionSummary
} from '@shared/ipc/contracts';
import { fail, ok, type Result } from '@shared/ipc/result';
import { hasRunForSession } from '../services/agent/run-registry';
import { EventStore } from '../services/session/event-store';
import { SessionService } from '../services/session/session-service';
import { getDatabase } from '../services/storage/database';

/* 注册会话相关 IPC；数据库在 app ready 后已初始化。 */
export const registerSessionIpc = (): void => {
  const db = getDatabase();
  const sessions = new SessionService(db, new EventStore(db));

  ipcMain.handle(IPC_CHANNELS.sessionList, async (): Promise<Result<SessionSummary[]>> => {
    try {
      return ok(sessions.list());
    } catch (error) {
      return fail('SESSION_LIST_FAILED', error instanceof Error ? error.message : '读取会话失败');
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.sessionCreate,
    async (_event, rawInput: unknown): Promise<Result<SessionSummary>> => {
      const parsed = sessionCreateInputSchema.safeParse(rawInput ?? {});
      if (!parsed.success) {
        return fail('SESSION_INVALID_INPUT', '会话参数不合法', parsed.error.flatten());
      }

      try {
        return ok(sessions.create(parsed.data));
      } catch (error) {
        return fail(
          'SESSION_CREATE_FAILED',
          error instanceof Error ? error.message : '创建会话失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.sessionGet,
    async (_event, rawId: unknown): Promise<Result<SessionSummary>> => {
      if (typeof rawId !== 'string' || !rawId)
        return fail('SESSION_INVALID_INPUT', '会话 id 不合法');

      const session = sessions.get(rawId);
      return session ? ok(session) : fail('SESSION_NOT_FOUND', `会话不存在：${rawId}`);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.sessionRename,
    async (_event, rawInput: unknown): Promise<Result<SessionSummary>> => {
      const parsed = sessionRenameInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return fail('SESSION_INVALID_INPUT', '会话名称不合法', parsed.error.flatten());
      }

      if (!sessions.get(parsed.data.id)) {
        return fail('SESSION_NOT_FOUND', `会话不存在：${parsed.data.id}`);
      }

      try {
        return ok(sessions.rename(parsed.data));
      } catch (error) {
        return fail('SESSION_RENAME_FAILED', error instanceof Error ? error.message : '重命名失败');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.sessionSetPinned,
    async (_event, rawInput: unknown): Promise<Result<SessionSummary>> => {
      const parsed = sessionSetPinnedInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return fail('SESSION_INVALID_INPUT', '置顶参数不合法', parsed.error.flatten());
      }
      if (!sessions.get(parsed.data.id)) {
        return fail('SESSION_NOT_FOUND', `会话不存在：${parsed.data.id}`);
      }

      try {
        return ok(sessions.setPinned(parsed.data.id, parsed.data.pinned));
      } catch (error) {
        return fail('SESSION_PIN_FAILED', error instanceof Error ? error.message : '更新置顶失败');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.sessionRemove,
    async (_event, rawId: unknown): Promise<Result<SessionRemoveResult>> => {
      if (typeof rawId !== 'string' || !rawId)
        return fail('SESSION_INVALID_INPUT', '会话 id 不合法');

      if (hasRunForSession(rawId)) {
        return fail('SESSION_BUSY', `会话有运行中的 Run：${rawId}`);
      }

      try {
        sessions.remove(rawId);
        return ok({ id: rawId });
      } catch (error) {
        return fail(
          'SESSION_REMOVE_FAILED',
          error instanceof Error ? error.message : '删除会话失败'
        );
      }
    }
  );
};
