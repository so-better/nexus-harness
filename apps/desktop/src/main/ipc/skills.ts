/**
 * Skill IPC：列出元信息与按需读取正文。
 */

import { BrowserWindow, dialog, ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { fail, ok, type Result } from '@shared/ipc/result';
import type { SkillDetail, SkillSummary } from '@shared/skills';
import { SkillService } from '../services/skills/skill-service';

export const registerSkillsIpc = (): void => {
  const skills = new SkillService();
  ipcMain.handle(IPC_CHANNELS.skillsList, async (): Promise<Result<SkillSummary[]>> => {
    try {
      return ok(await skills.scan());
    } catch (error) {
      return fail('SKILLS_LIST_FAILED', error instanceof Error ? error.message : '读取 Skill 失败');
    }
  });
  ipcMain.handle(
    IPC_CHANNELS.skillsImport,
    async (event): Promise<Result<SkillSummary[] | null>> => {
      const window = BrowserWindow.fromWebContents(event.sender);
      const options = {
        title: '导入 Skill 文件夹',
        properties: ['openDirectory', 'multiSelections'] as Array<
          'openDirectory' | 'multiSelections'
        >
      };
      const selected = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);
      if (selected.canceled || !selected.filePaths[0]) return ok(null);
      let firstError: unknown;
      let imported = 0;
      for (const sourcePath of selected.filePaths) {
        try {
          await skills.importDirectory(sourcePath);
          imported += 1;
        } catch (error) {
          firstError ??= error;
        }
      }
      if (imported === 0 && firstError) {
        return fail(
          'SKILL_IMPORT_FAILED',
          firstError instanceof Error ? firstError.message : '导入 Skill 失败'
        );
      }
      return ok(await skills.scan());
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.skillsDelete,
    async (_event, id: unknown): Promise<Result<SkillSummary[]>> => {
      if (typeof id !== 'string' || !id.trim())
        return fail('SKILL_INVALID_INPUT', 'Skill id 不合法');
      try {
        return ok(await skills.delete(id));
      } catch (error) {
        return fail(
          'SKILL_DELETE_FAILED',
          error instanceof Error ? error.message : '删除 Skill 失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.skillsRead,
    async (_event, name: unknown): Promise<Result<SkillDetail>> => {
      if (typeof name !== 'string' || !name.trim()) {
        return fail('SKILL_INVALID_INPUT', 'Skill 名称不合法');
      }
      const skill = await skills.read(name);
      if (!skill) return fail('SKILL_NOT_FOUND', `Skill 不存在：${name}`);
      return ok(skill);
    }
  );
};
