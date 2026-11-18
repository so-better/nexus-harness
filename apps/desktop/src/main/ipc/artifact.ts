/**
 * Artifact IPC：按会话与 ID 读取长输出，路径由主进程解析。
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { artifactReadInputSchema, type ArtifactReadResult } from '@shared/ipc/contracts';
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
};
