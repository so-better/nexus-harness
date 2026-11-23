/**
 * 记忆 Search 工具：让 Agent 按需检索已启用的全局记忆。
 */

import type { AgentToolDefinition, ToolExecutionResult } from '@nexus/core';
import type { MemoryReadInput, MemorySearchInput } from '@shared/memory';
import { memoryReadInputSchema, memorySearchInputSchema } from '@shared/memory';
import type { MemoryService } from '../memory/memory-service';

export const memorySearchToolDefinition: AgentToolDefinition = {
  name: 'memory_search',
  description: '按关键词搜索用户长期记忆；适合需要回忆用户偏好、长期事实或已确认决策时使用。',
  permission: 'read',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词或自然语言查询' },
      limit: { type: 'number', description: '最多返回条数，默认 10，最大 20' }
    },
    required: ['query'],
    additionalProperties: false
  }
};

export const memoryReadToolDefinition: AgentToolDefinition = {
  name: 'memory_read',
  description: '读取一条完整记忆；用于 memory_search 返回片段被截断或需要完整原文时。',
  permission: 'read',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'memory_search 返回的记忆 ID' }
    },
    required: ['id'],
    additionalProperties: false
  }
};

const MAX_RESULT_CONTENT = 800;

const success = (value: unknown): ToolExecutionResult => ({
  ok: true,
  output: JSON.stringify(value)
});

/**
 * 读取单条记忆；检索开关关闭时返回结构化错误。
 */
export const executeMemoryReadTool = async (
  input: unknown,
  memory: MemoryService
): Promise<ToolExecutionResult> => {
  const parsed: MemoryReadInput = memoryReadInputSchema.parse(input);
  if (!memory.settings().retrieval) {
    return {
      ok: false,
      output: '',
      error: { code: 'MEMORY_RETRIEVAL_DISABLED', message: '记忆检索已关闭' }
    };
  }
  const item = memory.find(parsed.id);
  return item && item.status === 'active'
    ? success({ memory: item })
    : { ok: false, output: '', error: { code: 'MEMORY_NOT_FOUND', message: '记忆不存在' } };
};

/**
 * 执行记忆检索；检索开关关闭时返回结构化错误。
 */
export const executeMemorySearchTool = async (
  input: unknown,
  memory: MemoryService
): Promise<ToolExecutionResult> => {
  const parsed: MemorySearchInput = memorySearchInputSchema.parse(input);
  if (!memory.settings().retrieval) {
    return {
      ok: false,
      output: '',
      error: { code: 'MEMORY_RETRIEVAL_DISABLED', message: '记忆检索已关闭' }
    };
  }
  const memories = memory.search(parsed.query, parsed.limit ?? 10);
  return success({
    memories: memories.map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      content: item.content.slice(0, MAX_RESULT_CONTENT),
      truncated: item.content.length > MAX_RESULT_CONTENT
    }))
  });
};
