/**
 * 工作区 IPC：当前只提供系统目录选择，完整工作区模型后续接入。
 */

import { dialog, ipcMain } from 'electron';
import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, sep } from 'node:path';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type {
  WorkspaceImagePreviewResult,
  WorkspaceRootSelection,
  WorkspaceFileReference
} from '@shared/ipc/contracts';
import {
  workspaceAuthorizationResolveInputSchema,
  workspaceChooseRootInputSchema,
  workspaceFileSearchInputSchema,
  workspaceImageReadInputSchema
} from '@shared/ipc/contracts';
import { EventStore } from '../services/session/event-store';
import { SessionService } from '../services/session/session-service';
import { getDatabase } from '../services/storage/database';
import { searchWorkspaceFiles } from '../services/workspace/file-search-service';
import { fail, ok, type Result } from '@shared/ipc/result';
import { workspaceAuthService } from '../services/agent/workspace-auth-service';
import { imageMimeForName } from '@shared/files';
import { isSensitivePath } from '@nexus/runtime-utils';

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
    IPC_CHANNELS.workspaceReadImage,
    async (_event, rawInput: unknown): Promise<Result<WorkspaceImagePreviewResult>> => {
      const parsed = workspaceImageReadInputSchema.safeParse(rawInput);
      if (!parsed.success) return fail('WORKSPACE_INVALID_INPUT', '图片预览参数不合法');
      const session = sessions.get(parsed.data.sessionId);
      if (!session) return fail('SESSION_NOT_FOUND', '会话不存在');
      if (!isAbsolute(parsed.data.path)) return fail('WORKSPACE_PATH_INVALID', '图片路径必须是绝对路径');
      try {
        const real = await realpath(parsed.data.path);
        const roots = await Promise.all(
          sessions.listRoots(parsed.data.sessionId).map((root) => realpath(root.path))
        );
        const allowed = roots.some((root) => real === root || real.startsWith(`${root}${sep}`));
        if (!allowed) return fail('WORKSPACE_PATH_DENIED', '图片不在授权目录内');
        if (isSensitivePath(real)) return fail('WORKSPACE_PATH_DENIED', '不能预览敏感路径');
        const mime = imageMimeForName(real);
        if (!mime) return fail('WORKSPACE_NOT_IMAGE', '文件不是支持的图片类型');
        const info = await stat(real);
        if (!info.isFile()) return fail('WORKSPACE_NOT_IMAGE', '路径不是文件');
        if (info.size > 8 * 1024 * 1024) return fail('WORKSPACE_IMAGE_TOO_LARGE', '图片超过 8MB');
        return ok({ mime, base64: (await readFile(real)).toString('base64') });
      } catch (error) {
        return fail(
          'WORKSPACE_IMAGE_READ_FAILED',
          error instanceof Error ? error.message : '读取图片失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.workspaceAuthorizationResolve,
    async (event, rawInput: unknown): Promise<Result<{ resolved: boolean }>> => {
      const parsed = workspaceAuthorizationResolveInputSchema.safeParse(rawInput);
      if (!parsed.success) return fail('WORKSPACE_INVALID_INPUT', '目录授权参数不合法');
      const resolved = workspaceAuthService.resolve(
        parsed.data.requestId,
        parsed.data.decision,
        event.sender.id
      );
      return resolved
        ? ok({ resolved: true })
        : fail('WORKSPACE_AUTHORIZATION_NOT_FOUND', '目录授权请求已失效');
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.workspaceChooseRoot,
    async (_event, rawInput: unknown): Promise<Result<WorkspaceRootSelection>> => {
      const parsed = workspaceChooseRootInputSchema.safeParse(rawInput);
      if (!parsed.success) return fail('WORKSPACE_INVALID_INPUT', '工作区参数不合法');
      try {
        const result = await dialog.showOpenDialog({
          title: '选择工作区',
          properties: ['openDirectory'],
          ...(parsed.data?.defaultPath ? { defaultPath: parsed.data.defaultPath } : {})
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
