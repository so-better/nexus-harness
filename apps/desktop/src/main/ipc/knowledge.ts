/**
 * 知识库 IPC：来源导入、重建、检索与打开原始位置。
 */

import { randomUUID } from 'node:crypto';
import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { knowledgeDirectoryImportInputSchema, knowledgeIdInputSchema } from '@shared/knowledge';
import type {
  KnowledgeDirectoryScan,
  KnowledgeImportResult,
  KnowledgeSource
} from '@shared/knowledge';
import { fail, ok, type Result } from '@shared/ipc/result';
import { getDatabase } from '../services/storage/database';
import { KnowledgeService } from '../services/knowledge/knowledge-service';

/**
 * 注册知识库处理器；知识库是应用级数据，不绑定会话或工作区。
 */
export const registerKnowledgeIpc = (): void => {
  const service = new KnowledgeService(getDatabase());
  service.rebuildIndex();
  const pendingDirectories = new Map<string, { path: string; expiresAt: number }>();
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [token, pending] of pendingDirectories) {
      if (pending.expiresAt < now) pendingDirectories.delete(token);
    }
  }, 60_000);
  cleanupTimer.unref();

  const broadcast = (): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.knowledgeChanged);
    }
  };

  ipcMain.handle(IPC_CHANNELS.knowledgeList, (): Result<KnowledgeSource[]> => {
    try {
      return ok(service.list());
    } catch (error) {
      return fail(
        'KNOWLEDGE_LIST_FAILED',
        error instanceof Error ? error.message : '读取知识库失败'
      );
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.knowledgeImportFiles,
    async (event): Promise<Result<KnowledgeImportResult | null>> => {
      const window = BrowserWindow.fromWebContents(event.sender);
      const options = {
        title: '导入知识库文件',
        properties: ['openFile', 'multiSelections'] as Array<'openFile' | 'multiSelections'>
      };
      const selected = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);
      if (selected.canceled || !selected.filePaths.length) return ok(null);
      try {
        const result = await service.importFiles(selected.filePaths);
        broadcast();
        return ok(result);
      } catch (error) {
        return fail(
          'KNOWLEDGE_IMPORT_FAILED',
          error instanceof Error ? error.message : '导入知识库失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.knowledgeScanDirectory,
    async (event): Promise<Result<KnowledgeDirectoryScan | null>> => {
      const window = BrowserWindow.fromWebContents(event.sender);
      const options = {
        title: '选择知识库目录',
        properties: ['openDirectory'] as Array<'openDirectory'>
      };
      const selected = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);
      if (selected.canceled || !selected.filePaths[0]) return ok(null);
      const path = selected.filePaths[0];
      try {
        const scan = await service.scanDirectory(path);
        const now = Date.now();
        for (const [token, pending] of pendingDirectories) {
          if (pending.expiresAt < now) pendingDirectories.delete(token);
        }
        const token = randomUUID();
        pendingDirectories.set(token, { path, expiresAt: now + 10 * 60_000 });
        return ok({ token, path, ...scan });
      } catch (error) {
        return fail(
          'KNOWLEDGE_SCAN_FAILED',
          error instanceof Error ? error.message : '扫描知识库目录失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.knowledgeImportDirectory,
    async (_event, rawInput: unknown): Promise<Result<KnowledgeImportResult | null>> => {
      const parsed = knowledgeDirectoryImportInputSchema.safeParse(rawInput);
      if (!parsed.success) return fail('KNOWLEDGE_INVALID_INPUT', '知识库目录导入参数不合法');
      const pending = pendingDirectories.get(parsed.data.token);
      pendingDirectories.delete(parsed.data.token);
      if (!pending || pending.expiresAt < Date.now()) {
        return fail('KNOWLEDGE_SCAN_EXPIRED', '知识库目录确认已过期，请重新选择');
      }
      try {
        const result = await service.importDirectory(pending.path);
        broadcast();
        return ok(result);
      } catch (error) {
        return fail(
          'KNOWLEDGE_IMPORT_FAILED',
          error instanceof Error ? error.message : '导入知识库目录失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.knowledgeRemove,
    async (_event, rawInput: unknown): Promise<Result<{ removed: boolean }>> => {
      const parsed = knowledgeIdInputSchema.safeParse(rawInput);
      if (!parsed.success) return fail('KNOWLEDGE_INVALID_INPUT', '知识库来源 ID 不合法');
      try {
        const removed = await service.remove(parsed.data.id);
        if (removed) broadcast();
        return ok({ removed });
      } catch (error) {
        return fail(
          'KNOWLEDGE_REMOVE_FAILED',
          error instanceof Error ? error.message : '删除知识库来源失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.knowledgeReindex,
    async (_event, rawInput: unknown): Promise<Result<KnowledgeSource>> => {
      const parsed = knowledgeIdInputSchema.safeParse(rawInput);
      if (!parsed.success) return fail('KNOWLEDGE_INVALID_INPUT', '知识库来源 ID 不合法');
      try {
        const source = await service.reindex(parsed.data.id);
        if (!source) return fail('KNOWLEDGE_NOT_FOUND', '知识库来源不存在');
        broadcast();
        return ok(source);
      } catch (error) {
        const message = error instanceof Error ? error.message : '重新解析知识库来源失败';
        service.markError(parsed.data.id, message);
        broadcast();
        return fail('KNOWLEDGE_REINDEX_FAILED', message);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.knowledgeOpenSource,
    async (_event, rawInput: unknown): Promise<Result<{ opened: boolean }>> => {
      const parsed = knowledgeIdInputSchema.safeParse(rawInput);
      if (!parsed.success) return fail('KNOWLEDGE_INVALID_INPUT', '知识库来源 ID 不合法');
      const source = service.find(parsed.data.id);
      if (!source) return ok({ opened: false });
      const target = service.storedPath(source.id) ?? source.originPath;
      if (!target) return ok({ opened: false });
      shell.showItemInFolder(target);
      return ok({ opened: true });
    }
  );
};
