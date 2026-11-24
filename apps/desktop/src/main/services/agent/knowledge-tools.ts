/**
 * 知识库检索工具：按需读取用户导入的资料并返回可引用片段。
 */

import type { AgentToolDefinition, ToolExecutionResult } from '@nexus/core';
import { knowledgeSearchInputSchema, type KnowledgeSearchInput } from '@shared/knowledge';
import type { KnowledgeService } from '../knowledge/knowledge-service';

export const searchKnowledgeToolDefinition: AgentToolDefinition = {
  name: 'search_knowledge',
  description:
    '搜索用户知识库中的私有资料；需要参考产品文档、规范、笔记或内部资料时使用。返回命中片段、来源名称和标题。',
  permission: 'read',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '自然语言问题或关键词' },
      limit: { type: 'number', description: '最多返回条数，默认 8，最大 20' }
    },
    required: ['query'],
    additionalProperties: false
  }
};

/**
 * 执行知识库检索；无命中时返回空数组而不是错误。
 */
export const executeSearchKnowledgeTool = async (
  input: unknown,
  knowledge: KnowledgeService
): Promise<ToolExecutionResult> => {
  const parsed: KnowledgeSearchInput = knowledgeSearchInputSchema.parse(input);
  const hits = knowledge.search(parsed);
  return { ok: true, output: JSON.stringify({ query: parsed.query, hits }) };
};
