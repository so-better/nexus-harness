/**
 * Artifact 服务测试：落盘、净化与大小上限。
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../storage/database';
import { ArtifactService } from './artifact-service';

describe('ArtifactService', () => {
  let directory = '';
  let database: DatabaseSync | undefined;
  let artifacts: ArtifactService;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nexus-artifacts-'));
    artifacts = new ArtifactService(directory);
  });

  afterEach(async () => {
    database?.close();
    database = undefined;
    await rm(directory, { recursive: true, force: true });
  });

  it('saves full text and returns a stable reference', async () => {
    const stored = await artifacts.saveText('session-1', 'tool-output', '完整内容');

    expect(stored.bytes).toBe(Buffer.byteLength('完整内容'));
    expect(stored.path.startsWith(directory)).toBe(true);
    await expect(readFile(stored.path, 'utf8')).resolves.toBe('完整内容');
  });

  it('indexes artifacts and reads them by session and id', async () => {
    database = createDatabase(join(directory, 'test.db'));
    artifacts = new ArtifactService(directory, database);

    const stored = await artifacts.saveText('session-1', 'tool-output', '完整内容', {
      runId: 'run-1'
    });
    const content = await artifacts.read('session-1', stored.artifactId);

    expect(content).toMatchObject({
      artifactId: stored.artifactId,
      label: 'tool-output',
      content: '完整内容'
    });
    await expect(artifacts.read('session-2', stored.artifactId)).resolves.toBeUndefined();
  });

  it('reads a paginated range and reports truncation', async () => {
    database = createDatabase(join(directory, 'test.db'));
    artifacts = new ArtifactService(directory, database);

    const content = 'a'.repeat(100) + 'b'.repeat(100);
    const stored = await artifacts.saveText('session-1', 'tool-output', content);

    const first = await artifacts.readRange('session-1', stored.artifactId, 100, 50);
    expect(first?.content).toBe('b'.repeat(50));
    expect(first?.truncated).toBe(true);

    const second = await artifacts.readRange('session-1', stored.artifactId, 150, 50);
    expect(second?.content).toBe('b'.repeat(50));
    expect(second?.truncated).toBe(false);
  });

  it('decodes multibyte content across read chunk boundaries', async () => {
    database = createDatabase(join(directory, 'test.db'));
    artifacts = new ArtifactService(directory, database);

    // 30000 个中文字符约 90KB，跨越 64KB 读取块，验证流式解码不产生乱码
    const content = '中'.repeat(30_000);
    const stored = await artifacts.saveText('session-1', 'tool-output', content);

    const slice = await artifacts.readRange('session-1', stored.artifactId, 25_000, 5_000);
    expect(slice?.content).toBe('中'.repeat(5_000));
    expect(slice?.truncated).toBe(false);
  });

  it('rejects artifacts over the size limit', async () => {
    await expect(
      artifacts.saveText('session-1', 'tool-output', 'x'.repeat(10_000_001))
    ).rejects.toThrow('ARTIFACT_TOO_LARGE');
  });

  it('sanitizes session ids to prevent path traversal', async () => {
    const stored = await artifacts.saveText('../outside', '../label', 'x');

    expect(stored.path.startsWith(directory)).toBe(true);
    expect(stored.path).not.toContain('..');
  });
});
