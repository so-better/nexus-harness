// @vitest-environment node
/**
 * search_knowledge：检索知识库并返回来源片段。
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../storage/database';
import { KnowledgeService } from '../knowledge/knowledge-service';
import { executeSearchKnowledgeTool, searchKnowledgeToolDefinition } from './knowledge-tools';

describe('search_knowledge tool', () => {
  let directory = '';
  let knowledge: KnowledgeService;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nexus-knowledge-tool-'));
    knowledge = new KnowledgeService(
      createDatabase(join(directory, 'nexus.db')),
      join(directory, 'knowledge')
    );
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('is read-only without approval', () => {
    expect(searchKnowledgeToolDefinition).toMatchObject({
      name: 'search_knowledge',
      permission: 'read',
      requiresApproval: false
    });
  });

  it('returns matching chunks with source metadata', async () => {
    const path = join(directory, 'api.md');
    await writeFile(path, '分页参数使用 page 和 pageSize。', 'utf8');
    await knowledge.importFiles([path]);
    const result = await executeSearchKnowledgeTool({ query: 'pageSize' }, knowledge);
    const payload = JSON.parse(result.output) as {
      query: string;
      hits: Array<{ sourceName: string; snippet: string }>;
    };
    expect(payload.query).toBe('pageSize');
    expect(payload.hits[0]).toMatchObject({ sourceName: 'api.md' });
    expect(payload.hits[0]?.snippet).toContain('pageSize');
  });
});
