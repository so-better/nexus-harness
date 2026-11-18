/**
 * 工作区 IPC：当前只提供系统目录选择，完整工作区模型后续接入。
 */

import { dialog, ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { WorkspaceRootSelection } from '@shared/ipc/contracts';
import { fail, ok, type Result } from '@shared/ipc/result';

/**
 * 注册 workspace:chooseRoot；取消时返回空集合而非错误。
 */
export const registerWorkspaceIpc = (): void => {
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
