// @vitest-environment node
/**
 * 知识库服务：来源导入、检索、重建与删除。
 */
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createDatabase } from '../storage/database';
import { KnowledgeService } from './knowledge-service';

describe('KnowledgeService', () => {
  let directory = '';
  let database: DatabaseSync;
  let service: KnowledgeService;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nexus-knowledge-'));
    database = createDatabase(join(directory, 'nexus.db'));
    service = new KnowledgeService(database, join(directory, 'knowledge'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('imports a file and retrieves it with source information', async () => {
    const path = join(directory, 'policy.md');
    await writeFile(path, '退款申请后三个工作日到账。', 'utf8');
    const source = (await service.importFiles([path])).sources[0]!;
    expect(source.chunkCount).toBe(1);

    const hits = service.search({ query: '三个工作日' });
    expect(hits[0]).toMatchObject({ sourceId: source.id, sourceName: 'policy.md' });
    expect(hits[0]?.snippet).toContain('三个工作日');
  });

  it('imports a text file and reindexes it', async () => {
    const path = join(directory, 'guide.md');
    await writeFile(path, '# 接口规范\n\n分页参数使用 page 和 pageSize。', 'utf8');

    const imported = await service.importFiles([path]);
    expect(imported.errors).toEqual([]);
    expect(imported.sources[0]?.originPath).toBe(path);
    expect((await stat(join(directory, 'knowledge', imported.sources[0]!.id))).isDirectory()).toBe(
      true
    );
    expect(service.search({ query: 'pageSize' })[0]?.sourceId).toBe(imported.sources[0]?.id);

    const reindexed = await service.reindex(imported.sources[0]!.id);
    expect(reindexed?.chunkCount).toBe(1);

    await writeFile(path, '# 新规范\n\n改用 cursor 分页。', 'utf8');
    await service.reindex(imported.sources[0]!.id);
    expect(service.search({ query: 'cursor' })[0]?.sourceId).toBe(imported.sources[0]?.id);
  });

  it('scans a directory before importing', async () => {
    const docs = join(directory, 'docs');
    await mkdir(docs, { recursive: true });
    await writeFile(join(docs, 'a.txt'), '知识库目录内容', 'utf8');
    await writeFile(join(docs, 'image.png'), 'binary', 'utf8');

    const scan = await service.scanDirectory(docs);
    expect(scan).toMatchObject({ fileCount: 1, skipped: 1 });
    expect(scan.totalBytes).toBeGreaterThan(0);
  });

  it('imports a directory and removes sources', async () => {
    const docs = join(directory, 'docs');
    await mkdir(docs, { recursive: true });
    await writeFile(join(docs, 'a.txt'), '知识库目录内容', 'utf8');
    const imported = await service.importDirectory(docs);
    expect(imported.sources).toHaveLength(1);

    const removed = await service.remove(imported.sources[0]!.id);
    expect(removed).toBe(true);
    expect(service.list()).toEqual([]);
  });

  it('hides sources whose local copies were deleted externally', async () => {
    const path = join(directory, 'gone.md');
    await writeFile(path, '会被外部删除的内容', 'utf8');
    const source = (await service.importFiles([path])).sources[0]!;
    const stored = service.storedPath(source.id)!;
    await rm(stored, { force: true });

    expect(service.search({ query: '外部删除' })).toEqual([]);
    expect(service.list()).toEqual([]);
    const row = database
      .prepare('SELECT status, error FROM knowledge_sources WHERE id = ?')
      .get(source.id) as { status: string; error: string };
    expect(row).toEqual({ status: 'error', error: '本地文件已删除' });
  });

  it('keeps chunks when the source file is unavailable', async () => {
    const path = join(directory, 'lost.md');
    await writeFile(path, '必须保留的索引内容', 'utf8');
    const source = (await service.importFiles([path])).sources[0]!;
    await rm(path, { force: true });
    await rm(join(directory, 'knowledge', source.id), { recursive: true, force: true });

    await expect(service.reindex(source.id)).rejects.toThrow('来源文件不可读');
    const row = database
      .prepare('SELECT COUNT(*) AS count FROM knowledge_chunks WHERE source_id = ?')
      .get(source.id) as { count: number };
    expect(row.count).toBeGreaterThan(0);
  });

  it('rebuilds the search index from stored chunks', async () => {
    const path = join(directory, 'deploy.md');
    await writeFile(path, '生产环境部署前需要备份数据库。', 'utf8');
    await service.importFiles([path]);
    expect(service.rebuildIndex()).toBe(true);
    expect(service.search({ query: '备份数据库' }).length).toBeGreaterThan(0);
  });
});
