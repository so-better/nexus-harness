/**
 * Artifact API：渲染层通过类型化方法读取与另存产物。
 */

import { nexus } from '@/app/nexus-bridge';
import { unwrap } from '@/app/ipc';
import type {
  ArtifactMetaResult,
  ArtifactReadInput,
  ArtifactReadResult,
  ArtifactSaveAsInput,
  ArtifactSaveAsResult
} from '@shared/ipc/contracts';

/**
 * 读取产物内容；路径由主进程解析，渲染层只拿内容。
 */
export const readArtifact = async (input: ArtifactReadInput): Promise<ArtifactReadResult> =>
  unwrap(await nexus.artifact.read(input));

/**
 * 只读取产物元信息，不加载完整内容。
 */
export const readArtifactMeta = async (
  input: ArtifactReadInput
): Promise<ArtifactMetaResult> => unwrap(await nexus.artifact.meta(input));

/**
 * 通过系统保存对话框另存产物。
 */
export const saveArtifactAs = async (
  input: ArtifactSaveAsInput
): Promise<ArtifactSaveAsResult> => unwrap(await nexus.artifact.saveAs(input));
