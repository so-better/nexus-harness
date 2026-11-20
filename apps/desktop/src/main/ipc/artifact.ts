/**
 * Artifact IPC：按会话与 ID 读取长输出，路径由主进程解析。
 */

import { dialog, ipcMain } from 'electron';
import { writeFile } from 'node:fs/promises';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import {
  artifactReadInputSchema,
  artifactSaveAsInputSchema,
  type ArtifactMetaResult,
  type ArtifactReadResult,
  type ArtifactSaveAsResult
} from '@shared/ipc/contracts';
import { fail, ok, type Result } from '@shared/ipc/result';
import { ArtifactService } from '../services/artifacts/artifact-service';
import { getDatabase } from '../services/storage/database';

/**
 * 注册 artifact:read；只允许读取当前数据库索引中的产物。
 */
export const registerArtifactIpc = (): void => {
  const artifacts = new ArtifactService(undefined, getDatabase());

  ipcMain.handle(
    IPC_CHANNELS.artifactRead,
    async (_event, rawInput: unknown): Promise<Result<ArtifactReadResult>> => {
      const parsed = artifactReadInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return fail('ARTIFACT_INVALID_INPUT', '产物参数不合法', parsed.error.flatten());
      }

      const artifact = await artifacts.read(parsed.data.sessionId, parsed.data.artifactId);
      if (!artifact) return fail('ARTIFACT_NOT_FOUND', '产物不存在或不可读取');

      return ok(artifact);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.artifactMeta,
    async (_event, rawInput: unknown): Promise<Result<ArtifactMetaResult>> => {
      const parsed = artifactReadInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return fail('ARTIFACT_INVALID_INPUT', '产物参数不合法');
      }
      const meta = await artifacts.meta(parsed.data.sessionId, parsed.data.artifactId);
      if (!meta) return fail('ARTIFACT_NOT_FOUND', '产物不存在或不可读取');
      return ok(meta);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.artifactSaveAs,
    async (_event, rawInput: unknown): Promise<Result<ArtifactSaveAsResult>> => {
      const parsed = artifactSaveAsInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return fail('ARTIFACT_INVALID_INPUT', '产物参数不合法');
      }

      const meta = await artifacts.meta(parsed.data.sessionId, parsed.data.artifactId);
      if (!meta) return fail('ARTIFACT_NOT_FOUND', '产物不存在或不可读取');

      const result = await dialog.showSaveDialog({
        title: '另存为',
        defaultPath: `${meta.label}.txt`
      });
      if (result.canceled || !result.filePath) {
        return ok({ artifactId: meta.artifactId, saved: false });
      }

      try {
        const artifact = await artifacts.read(parsed.data.sessionId, parsed.data.artifactId);
        if (!artifact) return fail('ARTIFACT_NOT_FOUND', '产物不存在或不可读取');
        await writeFile(result.filePath, artifact.content, 'utf8');
        return ok({ artifactId: artifact.artifactId, saved: true, path: result.filePath });
      } catch (error) {
        return fail(
          'ARTIFACT_SAVE_FAILED',
          error instanceof Error ? error.message : '保存产物失败'
        );
      }
    }
  );
};
