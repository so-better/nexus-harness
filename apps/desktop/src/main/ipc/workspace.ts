/**
 * 工作区 IPC：当前只提供系统目录选择，完整工作区模型后续接入。
 */

import { dialog, ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { WorkspaceRootSelection, WorkspaceFileReference } from '@shared/ipc/contracts';
import { workspaceFileSearchInputSchema } from '@shared/ipc/contracts';
import { EventStore } from '../services/session/event-store';
import { SessionService } from '../services/session/session-service';
import { getDatabase } from '../services/storage/database';
import { searchWorkspaceFiles } from '../services/workspace/file-search-service';
import { fail, ok, type Result } from '@shared/ipc/result';

/**
 * 注册 workspace:chooseRoot；取消时返回空集合而非错误。
 */
export const registerWorkspaceIpc = (): void => {
  const db = getDatabase();
  const events = new EventStore(db);
  const sessions = new SessionService(db, events);

  ipcMain.handle(
    IPC_CHANNELS.workspaceSearchFiles,
    async (_event, rawInput: unknown): Promise<Result<WorkspaceFileReference[]>> => {
      const parsed = workspaceFileSearchInputSchema.safeParse(rawInput);
      if (!parsed.success) return fail('WORKSPACE_INVALID_INPUT', '文件搜索参数不合法');
      if (!sessions.get(parsed.data.sessionId)) {
        return fail('SESSION_NOT_FOUND', `会话不存在：${parsed.data.sessionId}`);
      }
      try {
        const roots = sessions.listRoots(parsed.data.sessionId).map((root) => root.path);
        return ok(await searchWorkspaceFiles(roots, parsed.data.query, parsed.data.limit ?? 20));
      } catch (error) {
        return fail(
          'WORKSPACE_SEARCH_FAILED',
          error instanceof Error ? error.message : '搜索文件失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.workspaceChooseRoot,
    async (): Promise<Result<WorkspaceRootSelection>> => {
      try {
        const result = await dialog.showOpenDialog({
          title: '选择工作区',
          properties: ['openDirectory', 'multiSelections']
        });
        if (result.canceled) return ok({ paths: [] });
        return ok({ paths: result.filePaths });
      } catch (error) {
        return fail(
          'WORKSPACE_CHOOSE_FAILED',
          error instanceof Error ? error.message : '选择工作区失败'
        );
      }
    }
  );
};
