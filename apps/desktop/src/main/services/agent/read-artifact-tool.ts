/**
 * read_artifact：读取上下文压缩时落盘的完整工具输出，支持字符偏移分页。
 * 产物按会话隔离，只读文本，不暴露真实文件路径。
 */

import type { AgentToolDefinition } from '@nexus/core';
import { z } from 'zod';
import type { ArtifactService } from '../artifacts/artifact-service';

/**
 * 单次默认读取字符数与上限；避免一次把超大产物全部塞回上下文。
 */
const DEFAULT_MAX_CHARS = 20_000;
const MAX_CHARS = 100_000;

/**
 * read_artifact 输入契约：artifactId 必填，offset 与 maxChars 用于分页。
 */
export const readArtifactInputSchema = z.object({
  artifactId: z.string().min(1),
  offset: z.number().int().nonnegative().optional(),
  maxChars: z.number().int().positive().max(MAX_CHARS).optional()
});

/**
 * read_artifact 工具定义；常驻 core，Plan 模式也可用（只读）。
 */
export const readArtifactToolDefinition: AgentToolDefinition = {
  name: 'read_artifact',
  description:
    '读取被截断或压缩的工具完整输出；用预览里的 artifactId 与 offset 分页读取，不要在内容不明时猜测。',
  permission: 'read',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      artifactId: { type: 'string', description: '工具结果预览中给出的产物 ID' },
      offset: { type: 'number', description: '字符偏移，默认 0' },
      maxChars: { type: 'number', description: `本次最多读取字符数，默认 ${DEFAULT_MAX_CHARS}` }
    },
    required: ['artifactId'],
    additionalProperties: false
  }
};

export interface ReadArtifactResult {
  ok: boolean;
  output: string;
  error?: { code: string; message: string };
}

/**
 * 按会话读取产物分片；返回带 nextOffset 提示的结构化结果。
 */
export const runReadArtifactTool = async (
  artifacts: ArtifactService,
  sessionId: string,
  input: unknown
): Promise<ReadArtifactResult> => {
  const parsed = readArtifactInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      output: '',
      error: { code: 'TOOL_INPUT_INVALID', message: 'artifactId 参数不合法' }
    };
  }

  const offset = parsed.data.offset ?? 0;
  const maxChars = parsed.data.maxChars ?? DEFAULT_MAX_CHARS;
  const slice = await artifacts.readRange(sessionId, parsed.data.artifactId, offset, maxChars);
  if (!slice) {
    return {
      ok: false,
      output: '',
      error: {
        code: 'ARTIFACT_NOT_FOUND',
        message: '未找到该产物，可能已被清理或不属于当前会话'
      }
    };
  }

  // 已到内容末尾之后仍请求非零偏移，视为越界
  if (!slice.truncated && offset > 0 && slice.content === '') {
    return {
      ok: false,
      output: '',
      error: {
        code: 'ARTIFACT_OFFSET_OUT_OF_RANGE',
        message: `偏移超出内容长度：${offset}`
      }
    };
  }

  const end = offset + slice.content.length;

  return {
    ok: true,
    output: JSON.stringify({
      artifactId: slice.artifactId,
      label: slice.label,
      bytes: slice.bytes,
      offset,
      end,
      truncated: slice.truncated,
      content: slice.content,
      ...(slice.truncated
        ? {
            hint: `用 read_artifact({ artifactId: "${slice.artifactId}", offset: ${end} }) 继续读取`
          }
        : {})
    })
  };
};
