/**
 * 内置终端 IPC：创建、输入、调整尺寸、关闭与事件广播。
 */

import { BrowserWindow, ipcMain } from 'electron';
import { createNexusEvent } from '@nexus/core';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import {
  terminalBusyInputSchema,
  terminalCloseInputSchema,
  terminalCreateInputSchema,
  terminalResizeInputSchema,
  terminalWriteInputSchema,
  type TerminalEvent
} from '@shared/ipc/contracts';
import { fail, ok, type Result } from '@shared/ipc/result';
import { getDatabase } from '../services/storage/database';
import { EventStore } from '../services/session/event-store';
import { SessionService } from '../services/session/session-service';
import { terminalService } from '../services/terminal/terminal-service';
import { resolveTerminalCwd } from '../services/terminal/terminal-cwd';

/**
 * 注册终端通道；终端事件只广播，不持久化到聊天事件流。
 */
export const registerTerminalIpc = (): void => {
  const db = getDatabase();
  const events = new EventStore(db);
  const sessions = new SessionService(db, events);

  terminalService.onEvent((event: TerminalEvent) => {
    try {
      if (event.type === 'created' && event.terminal.source === 'user') {
        events.append(
          createNexusEvent({
            sessionId: event.terminal.sessionId,
            seq: 1,
            type: 'terminal.opened',
            payload: {
              terminalId: event.terminal.id,
              sessionId: event.terminal.sessionId,
              cwd: event.terminal.cwd,
              pid: event.terminal.pid,
              shell: event.terminal.shell
            }
          })
        );
      } else if (event.type === 'closed') {
        events.append(
          createNexusEvent({
            sessionId: event.sessionId,
            seq: 1,
            type: 'terminal.closed',
            payload: { terminalId: event.id, sessionId: event.sessionId }
          })
        );
      }
    } catch (error) {
      console.error('终端生命周期事件写入失败', error);
    }

    const id = event.type === 'created' ? event.terminal.id : event.id;
    const ownerId = terminalService.ownerOf(id);
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed()) continue;
      if (ownerId !== undefined && window.webContents.id !== ownerId) continue;
      window.webContents.send(IPC_CHANNELS.terminalEvent, event);
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.terminalList,
    (event): Result<ReturnType<typeof terminalService.list>> =>
      ok(terminalService.list(event.sender.id))
  );

  ipcMain.handle(
    IPC_CHANNELS.terminalCreate,
    async (
      event,
      rawInput: unknown
    ): Promise<Result<ReturnType<typeof terminalService.create>>> => {
      const parsed = terminalCreateInputSchema.safeParse(rawInput);
      if (!parsed.success) return fail('TERMINAL_INVALID_INPUT', '终端参数不合法');
      const session = sessions.get(parsed.data.sessionId);
      if (!session) return fail('SESSION_NOT_FOUND', '会话不存在');
      const root = sessions.listRoots(session.id).find((item) => item.kind === 'directory');
      const cwd = resolveTerminalCwd(root?.path);
      try {
        return ok(
          terminalService.create({
            sessionId: session.id,
            cwd,
            ...(parsed.data.cols === undefined ? {} : { cols: parsed.data.cols }),
            ...(parsed.data.rows === undefined ? {} : { rows: parsed.data.rows }),
            source: 'user',
            ownerId: event.sender.id
          })
        );
      } catch (error) {
        return fail(
          'TERMINAL_CREATE_FAILED',
          error instanceof Error ? error.message : '创建终端失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.terminalBusy,
    async (event, rawInput: unknown): Promise<Result<{ busy: string[] }>> => {
      const parsed = terminalBusyInputSchema.safeParse(rawInput);
      if (!parsed.success) return fail('TERMINAL_INVALID_INPUT', '终端参数不合法');
      const ids = parsed.data.ids.filter((id) => terminalService.isOwnedBy(id, event.sender.id));
      try {
        const flags = await Promise.all(
          ids.map(async (id) => ((await terminalService.isBusy(id)) ? id : undefined))
        );
        return ok({ busy: flags.filter((id): id is string => Boolean(id)) });
      } catch (error) {
        return fail(
          'TERMINAL_OPERATION_FAILED',
          error instanceof Error ? error.message : '读取终端状态失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.terminalWrite,
    (event, rawInput: unknown): Result<{ ok: boolean }> => {
      const parsed = terminalWriteInputSchema.safeParse(rawInput);
      if (!parsed.success) return fail('TERMINAL_INVALID_INPUT', '终端输入不合法');
      if (!terminalService.isOwnedBy(parsed.data.id, event.sender.id)) {
        return fail('TERMINAL_ACCESS_DENIED', '无权操作该终端');
      }
      try {
        return ok({ ok: terminalService.write(parsed.data.id, parsed.data.data) });
      } catch (error) {
        return fail(
          'TERMINAL_OPERATION_FAILED',
          error instanceof Error ? error.message : '写入终端失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.terminalResize,
    (event, rawInput: unknown): Result<{ ok: boolean }> => {
      const parsed = terminalResizeInputSchema.safeParse(rawInput);
      if (!parsed.success) return fail('TERMINAL_INVALID_INPUT', '终端尺寸不合法');
      if (!terminalService.isOwnedBy(parsed.data.id, event.sender.id)) {
        return fail('TERMINAL_ACCESS_DENIED', '无权操作该终端');
      }
      try {
        return ok({
          ok: terminalService.resize(parsed.data.id, parsed.data.cols, parsed.data.rows)
        });
      } catch (error) {
        return fail(
          'TERMINAL_OPERATION_FAILED',
          error instanceof Error ? error.message : '调整终端尺寸失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.terminalClose,
    (event, rawInput: unknown): Result<{ closed: boolean }> => {
      const parsed = terminalCloseInputSchema.safeParse(rawInput);
      if (!parsed.success) return fail('TERMINAL_INVALID_INPUT', '终端参数不合法');
      if (!terminalService.isOwnedBy(parsed.data.id, event.sender.id)) {
        return fail('TERMINAL_ACCESS_DENIED', '无权操作该终端');
      }
      try {
        return ok({ closed: terminalService.close(parsed.data.id) });
      } catch (error) {
        return fail(
          'TERMINAL_OPERATION_FAILED',
          error instanceof Error ? error.message : '关闭终端失败'
        );
      }
    }
  );
};
