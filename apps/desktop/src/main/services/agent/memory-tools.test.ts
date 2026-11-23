// @vitest-environment node
/**
 * memory_search：读取 active 记忆并遵守检索开关。
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../storage/database';
import { MemoryService } from '../memory/memory-service';
import {
  executeMemoryReadTool,
  executeMemorySearchTool,
  memorySearchToolDefinition
} from './memory-tools';

describe('memory_search tool', () => {
  let directory = '';
  let memory: MemoryService;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nexus-memory-tool-'));
    memory = new MemoryService(createDatabase(join(directory, 'nexus.db')));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('is a read-only tool without approval', () => {
    expect(memorySearchToolDefinition).toMatchObject({
      name: 'memory_search',
      permission: 'read',
      requiresApproval: false
    });
  });

  it('truncates long memory content in tool output', async () => {
    memory.create({ title: '长记忆', content: '内容'.repeat(500), kind: 'fact' });
    const result = await executeMemorySearchTool({ query: '长记忆' }, memory);
    const item = JSON.parse(result.output).memories[0] as { content: string; truncated: boolean };
    expect(item.content.length).toBe(800);
    expect(item.truncated).toBe(true);
  });

  it('does not expose proposed memories through memory_read', async () => {
    const proposed = memory.propose({
      title: '回答风格',
      content: '偏好简洁中文回答。',
      kind: 'preference'
    });
    const result = await executeMemoryReadTool({ id: proposed!.id }, memory);
    expect(result).toMatchObject({ ok: false, error: { code: 'MEMORY_NOT_FOUND' } });
  });

  it('returns matching active memory and respects retrieval switch', async () => {
    memory.create({ title: '回答风格', content: '偏好简洁中文回答。', kind: 'preference' });
    const found = await executeMemorySearchTool({ query: '回答风格' }, memory);
    expect(found.ok).toBe(true);
    expect(JSON.parse(found.output).memories[0]).toMatchObject({ title: '回答风格' });

    memory.updateSettings({ autoCapture: true, retrieval: false });
    const disabled = await executeMemorySearchTool({ query: '回答风格' }, memory);
    expect(disabled).toMatchObject({ ok: false, error: { code: 'MEMORY_RETRIEVAL_DISABLED' } });
  });
});
