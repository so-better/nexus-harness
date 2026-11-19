/**
 * 会话 IPC：列表、创建、读取、重命名与删除。
 */

import { ipcMain } from 'electron';
import type { NexusEvent } from '@shared/events';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import {
  sessionAddRootsInputSchema,
  sessionCreateInputSchema,
  sessionRemoveRootInputSchema,
  sessionRenameInputSchema,
  sessionSetModeInputSchema,
  sessionSetModelInputSchema,
  sessionSetPinnedInputSchema,
  type SessionClearAllResult,
  type SessionRemoveResult,
  type SessionRoot,
  type SessionSearchResult,
  type SessionSummary
} from '@shared/ipc/contracts';
import { fail, ok, type Result } from '@shared/ipc/result';
import { hasRunForSession } from '../services/agent/run-registry';
import { EventStore } from '../services/session/event-store';
import { SessionService } from '../services/session/session-service';
import { searchSessions } from '../services/session/session-search';
import { getDatabase } from '../services/storage/database';
import { terminalService } from '../services/terminal/terminal-service';

/**
 * 注册会话相关 IPC；数据库在 app ready 后已初始化。
 */
export const registerSessionIpc = (): void => {
  const db = getDatabase();
  const events = new EventStore(db);
  const sessions = new SessionService(db, events);

  ipcMain.handle(
    IPC_CHANNELS.sessionEvents,
    async (_event, rawId: unknown): Promise<Result<NexusEvent[]>> => {
      if (typeof rawId !== 'string' || !rawId) {
        return fail('SESSION_INVALID_INPUT', '会话 id 不合法');
      }
      if (!sessions.get(rawId)) {
        return fail('SESSION_NOT_FOUND', `会话不存在：${rawId}`);
      }

      try {
        return ok(events.list(rawId));
      } catch (error) {
        return fail(
          'SESSION_EVENTS_FAILED',
          error instanceof Error ? error.message : '读取会话事件失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.sessionSearch,
    async (_event, rawQuery: unknown): Promise<Result<SessionSearchResult[]>> => {
      if (typeof rawQuery !== 'string') {
        return fail('SESSION_INVALID_INPUT', '搜索关键词不合法');
      }

      try {
        return ok(searchSessions(db, rawQuery));
      } catch (error) {
        return fail('SESSION_SEARCH_FAILED', error instanceof Error ? error.message : '搜索失败');
      }
    }
  );

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

  ipcMain.handle(IPC_CHANNELS.sessionClearAll, async (): Promise<Result<SessionClearAllResult>> => {
    const items = sessions.list();
    const busy = items.find((session) => hasRunForSession(session.id));
    if (busy) return fail('SESSION_BUSY', `会话有运行中的 Run：${busy.id}`);

    try {
      const result = sessions.removeAll();
      for (const session of items) terminalService.closeBySession(session.id);
      return ok(result);
    } catch (error) {
      return fail('SESSION_CLEAR_FAILED', error instanceof Error ? error.message : '清除会话失败');
    }
  });

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
    IPC_CHANNELS.sessionSetModel,
    async (_event, rawInput: unknown): Promise<Result<SessionSummary>> => {
      const parsed = sessionSetModelInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return fail('SESSION_INVALID_INPUT', '会话模型参数不合法', parsed.error.flatten());
      }
      if (!sessions.get(parsed.data.id)) {
        return fail('SESSION_NOT_FOUND', `会话不存在：${parsed.data.id}`);
      }

      try {
        return ok(sessions.setModel(parsed.data));
      } catch (error) {
        return fail(
          'SESSION_MODEL_FAILED',
          error instanceof Error ? error.message : '更新会话模型失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.sessionSetMode,
    async (_event, rawInput: unknown): Promise<Result<SessionSummary>> => {
      const parsed = sessionSetModeInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return fail('SESSION_INVALID_INPUT', '会话模式参数不合法', parsed.error.flatten());
      }
      if (!sessions.get(parsed.data.id)) {
        return fail('SESSION_NOT_FOUND', `会话不存在：${parsed.data.id}`);
      }
      if (hasRunForSession(parsed.data.id)) {
        return fail('SESSION_BUSY', `会话有运行中的 Run：${parsed.data.id}`);
      }

      try {
        return ok(sessions.setMode(parsed.data));
      } catch (error) {
        return fail(
          'SESSION_MODE_FAILED',
          error instanceof Error ? error.message : '更新会话模式失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.sessionRoots,
    async (_event, rawId: unknown): Promise<Result<SessionRoot[]>> => {
      if (typeof rawId !== 'string' || !rawId) {
        return fail('SESSION_INVALID_INPUT', '会话 id 不合法');
      }
      if (!sessions.get(rawId)) return fail('SESSION_NOT_FOUND', `会话不存在：${rawId}`);
      return ok(sessions.listRoots(rawId));
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.sessionAddRoots,
    async (_event, rawInput: unknown): Promise<Result<SessionRoot[]>> => {
      const parsed = sessionAddRootsInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return fail('SESSION_INVALID_INPUT', '工作区路径不合法', parsed.error.flatten());
      }
      if (!sessions.get(parsed.data.sessionId)) {
        return fail('SESSION_NOT_FOUND', `会话不存在：${parsed.data.sessionId}`);
      }

      try {
        return ok(await sessions.addRoots(parsed.data.sessionId, parsed.data.paths));
      } catch (error) {
        const code =
          error instanceof Error && 'code' in error && error.code === 'ENOENT'
            ? 'ROOT_NOT_FOUND'
            : 'ROOT_ADD_FAILED';
        return fail(code, error instanceof Error ? error.message : '添加工作区失败');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.sessionRemoveRoot,
    async (_event, rawInput: unknown): Promise<Result<SessionRoot[]>> => {
      const parsed = sessionRemoveRootInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return fail('SESSION_INVALID_INPUT', '工作区授权参数不合法', parsed.error.flatten());
      }
      if (!sessions.get(parsed.data.sessionId)) {
        return fail('SESSION_NOT_FOUND', `会话不存在：${parsed.data.sessionId}`);
      }
      return ok(sessions.removeRoot(parsed.data.sessionId, parsed.data.rootId));
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
        terminalService.closeBySession(rawId);
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
