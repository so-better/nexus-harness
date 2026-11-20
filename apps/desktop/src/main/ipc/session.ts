/**
 * 会话 IPC：列表、创建、读取、重命名与删除。
 */

import { BrowserWindow, dialog, ipcMain } from 'electron';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NexusEvent } from '@shared/events';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import {
  sessionAddRootsInputSchema,
  sessionCreateInputSchema,
  sessionRemoveRootInputSchema,
  sessionExportInputSchema,
  sessionRenameInputSchema,
  sessionSetModeInputSchema,
  sessionSetModelInputSchema,
  sessionSetPinnedInputSchema,
  type SessionClearAllResult,
  type SessionExportResult,
  type SessionRemoveResult,
  type SessionRoot,
  type SessionSearchResult,
  type SessionSummary
} from '@shared/ipc/contracts';
import { fail, ok, type Result } from '@shared/ipc/result';
import { hasRunForSession } from '../services/agent/run-registry';
import { FileService } from '../services/files/file-service';
import { createNexusEvent } from '@nexus/core';
import { EventStore } from '../services/session/event-store';
import { SessionService } from '../services/session/session-service';
import { AttachmentService } from '../services/attachments/attachment-service';
import { searchSessions } from '../services/session/session-search';
import { getDatabase } from '../services/storage/database';
import { buildSessionHtml, buildSessionMarkdown } from '../services/session/export-service';
import { terminalService } from '../services/terminal/terminal-service';

const exportMime = (format: 'markdown' | 'html' | 'pdf'): string => {
  if (format === 'markdown') return 'text/markdown';
  if (format === 'html') return 'text/html';
  return 'application/pdf';
};

/**
 * 注册会话相关 IPC；数据库在 app ready 后已初始化。
 */
export const registerSessionIpc = (): void => {
  const db = getDatabase();
  const events = new EventStore(db);
  const sessions = new SessionService(db, events);
  const attachments = new AttachmentService(db);
  const files = new FileService(db);

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
      for (const session of items) {
        terminalService.closeBySession(session.id);
        await attachments.removeBySession(session.id).catch(() => undefined);
      }
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
    IPC_CHANNELS.sessionExport,
    async (event, rawInput: unknown): Promise<Result<SessionExportResult>> => {
      const parsed = sessionExportInputSchema.safeParse(rawInput);
      if (!parsed.success) return fail('SESSION_INVALID_INPUT', '导出参数不合法');
      const session = sessions.get(parsed.data.sessionId);
      if (!session) return fail('SESSION_NOT_FOUND', '会话不存在');

      const title = session.title.replace(/[\\/:*?"<>|]/g, '_') || 'session';
      const extension = parsed.data.format === 'markdown' ? 'md' : parsed.data.format;
      const window = BrowserWindow.fromWebContents(event.sender);
      const confirmationOptions = {
        type: 'info' as const,
        title: '导出会话',
        message: '确认导出范围',
        detail:
          '导出将包含消息、工具调用、审批、用量和检查点；常见密钥会自动脱敏，单个超长输出会被截断。',
        buttons: ['继续导出', '取消'],
        defaultId: 0,
        cancelId: 1
      };
      const confirmation = window
        ? await dialog.showMessageBox(window, confirmationOptions)
        : await dialog.showMessageBox(confirmationOptions);
      if (confirmation.response !== 0) return ok({ saved: false });

      const result = window
        ? await dialog.showSaveDialog(window, {
            title: '导出会话',
            defaultPath: `${title}.${extension}`
          })
        : await dialog.showSaveDialog({ title: '导出会话', defaultPath: `${title}.${extension}` });
      if (result.canceled || !result.filePath) return ok({ saved: false });

      const sessionEvents = events.list(session.id);
      try {
        let content: string | Buffer;
        if (parsed.data.format === 'markdown') {
          content = buildSessionMarkdown(session, sessionEvents);
        } else {
          const html = buildSessionHtml(session, sessionEvents);
          if (parsed.data.format === 'html') {
            content = html;
          } else {
            const renderer = new BrowserWindow({
              show: false,
              width: 1000,
              height: 800,
              webPreferences: { sandbox: true, backgroundThrottling: false }
            });
            const temporaryDirectory = await mkdtemp(join(tmpdir(), 'nexus-export-'));
            const temporaryHtml = join(temporaryDirectory, 'session.html');
            try {
              await writeFile(temporaryHtml, html, 'utf8');
              await renderer.loadFile(temporaryHtml);
              content = await renderer.webContents.printToPDF({
                printBackground: true,
                pageSize: 'A4'
              });
            } finally {
              renderer.destroy();
              await rm(temporaryDirectory, { recursive: true, force: true });
            }
          }
        }
        const stored = await files.saveExport({
          sessionId: session.id,
          name: `${title}.${extension}`,
          mime: exportMime(parsed.data.format),
          content,
          source: 'generated'
        });
        await files.saveAs(stored.id, session.id, result.filePath);
        events.append(
          createNexusEvent({
            sessionId: session.id,
            seq: 1,
            type: 'session.exported',
            payload: {
              sessionId: session.id,
              format: parsed.data.format,
              fileId: stored.id
            }
          })
        );
        return ok({ saved: true, path: result.filePath, fileId: stored.id });
      } catch (error) {
        return fail(
          'SESSION_EXPORT_FAILED',
          error instanceof Error ? error.message : '导出会话失败'
        );
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
        terminalService.closeBySession(rawId);
        await attachments.removeBySession(rawId).catch(() => undefined);
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
