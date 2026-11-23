/**
 * 全局记忆 IPC：列出、创建、更新与删除长期记忆。
 */

import { BrowserWindow, ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import {
  memoryCreateInputSchema,
  memoryIdInputSchema,
  memorySettingsSchema,
  memoryUpdateInputSchema
} from '@shared/memory';
import type { MemoryItem, MemorySettings } from '@shared/memory';
import { fail, ok, type Result } from '@shared/ipc/result';
import { getDatabase } from '../services/storage/database';
import { MemoryService } from '../services/memory/memory-service';

/**
 * 注册记忆处理器；记忆是全局数据，不关联 session 或 workspace。
 */
export const registerMemoryIpc = (): void => {
  const service = new MemoryService(getDatabase());
  // 尝试补齐/重建索引，修复迁移时 FTS5 不可用或索引缺失
  service.rebuildIndex();
  const broadcast = (): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.memoryChanged);
    }
  };

  ipcMain.handle(IPC_CHANNELS.memoryList, (): Result<MemoryItem[]> => {
    try {
      return ok(service.list());
    } catch (error) {
      return fail('MEMORY_READ_FAILED', error instanceof Error ? error.message : '读取记忆失败');
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.memoryCreate,
    async (_event, rawInput: unknown): Promise<Result<MemoryItem>> => {
      const parsed = memoryCreateInputSchema.safeParse(rawInput);
      if (!parsed.success) return fail('MEMORY_INVALID_INPUT', '记忆参数不合法');
      try {
        const created = service.create(parsed.data);
        broadcast();
        return ok(created);
      } catch (error) {
        return fail(
          'MEMORY_CREATE_FAILED',
          error instanceof Error ? error.message : '创建记忆失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.memoryUpdate,
    async (_event, rawInput: unknown): Promise<Result<MemoryItem>> => {
      const parsed = memoryUpdateInputSchema.safeParse(rawInput);
      if (!parsed.success) return fail('MEMORY_INVALID_INPUT', '记忆参数不合法');
      try {
        const updated = service.update(parsed.data);
        return updated ? ok(updated) : fail('MEMORY_NOT_FOUND', '记忆不存在');
      } catch (error) {
        return fail(
          'MEMORY_UPDATE_FAILED',
          error instanceof Error ? error.message : '更新记忆失败'
        );
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.memoryGetSettings, (): Result<MemorySettings> => {
    try {
      return ok(service.settings());
    } catch (error) {
      return fail(
        'MEMORY_SETTINGS_READ_FAILED',
        error instanceof Error ? error.message : '读取记忆设置失败'
      );
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.memorySetSettings,
    async (_event, rawInput: unknown): Promise<Result<MemorySettings>> => {
      const parsed = memorySettingsSchema.safeParse(rawInput);
      if (!parsed.success) return fail('MEMORY_INVALID_INPUT', '记忆设置参数不合法');
      try {
        const settings = service.updateSettings(parsed.data);
        broadcast();
        return ok(settings);
      } catch (error) {
        return fail(
          'MEMORY_SETTINGS_WRITE_FAILED',
          error instanceof Error ? error.message : '保存记忆设置失败'
        );
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.memoryRebuildIndex, (): Result<{ rebuilt: boolean }> => {
    try {
      return ok({ rebuilt: service.rebuildIndex() });
    } catch (error) {
      return fail(
        'MEMORY_REBUILD_FAILED',
        error instanceof Error ? error.message : '重建记忆索引失败'
      );
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.memoryDelete,
    async (_event, rawInput: unknown): Promise<Result<{ removed: boolean }>> => {
      const parsed = memoryIdInputSchema.safeParse(rawInput);
      if (!parsed.success) return fail('MEMORY_INVALID_INPUT', '记忆参数不合法');
      try {
        const removed = service.remove(parsed.data.id);
        if (removed) broadcast();
        return ok({ removed });
      } catch (error) {
        return fail(
          'MEMORY_DELETE_FAILED',
          error instanceof Error ? error.message : '删除记忆失败'
        );
      }
    }
  );
};
