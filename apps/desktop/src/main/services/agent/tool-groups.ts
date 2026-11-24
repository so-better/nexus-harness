/**
 * 工具分组元信息。
 * 分组用于 Plan 只读基线与工具来源标注；自动选择由 tool-selector + 模型重排完成。
 */

import { z } from 'zod';
import type { AgentToolDefinition } from '@nexus/core';

/**
 * 工具组标识；新增组需同步更新 TOOL_GROUP_META 与 agent-service 的注册表。
 */
export const TOOL_GROUP_IDS = [
  'core',
  'web',
  'media',
  'office',
  'terminal',
  'appearance',
  'maintenance',
  'extensions',
  'mcp'
] as const;

export type ToolGroupId = (typeof TOOL_GROUP_IDS)[number];

/**
 * 分组元信息；title 用作相关性筛选的补充文本。
 */
export interface ToolGroupMeta {
  id: ToolGroupId;
  title: string;
}

export const TOOL_GROUP_META: Record<ToolGroupId, ToolGroupMeta> = {
  core: { id: 'core', title: '文件与对话' },
  web: { id: 'web', title: '网页' },
  media: { id: 'media', title: '媒体' },
  office: { id: 'office', title: '办公文档' },
  terminal: { id: 'terminal', title: '终端' },
  appearance: { id: 'appearance', title: '外观' },
  maintenance: { id: 'maintenance', title: '维护' },
  extensions: { id: 'extensions', title: '扩展' },
  mcp: { id: 'mcp', title: 'MCP 工具' }
};

/**
 * search_tools 的输入契约：自然语言查询与可选数量上限。
 */
export const searchToolsInputSchema = z.object({
  query: z.string().min(1).max(2_000),
  limit: z.number().int().positive().max(20).optional()
});

/**
 * search_tools 工具定义；常驻 core，作为模型主动检索工具能力的兜底。
 */
export const searchToolsToolDefinition: AgentToolDefinition = {
  name: 'search_tools',
  description:
    '按自然语言查询搜索并加载匹配的工具（含内置与 MCP），加载后下一步即可调用；缺少所需能力时主动调用。',
  permission: 'read',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '描述需要的工具能力或关键词' },
      limit: { type: 'number', description: '最多加载数量，默认 8，最大 20' }
    },
    required: ['query'],
    additionalProperties: false
  }
};

/**
 * 默认常驻组：仅 core（文件/对话基能力），其余工具由统一筛选或 search_tools 加载。
 */
export const DEFAULT_TOOL_GROUPS: readonly ToolGroupId[] = ['core'];

/**
 * Plan 模式常驻组：除 core 外只为只读管理工具提供载体，写入工具会被白名单过滤。
 */
export const PLAN_TOOL_GROUPS: readonly ToolGroupId[] = [
  'core',
  'appearance',
  'terminal',
  'maintenance',
  'extensions'
];
