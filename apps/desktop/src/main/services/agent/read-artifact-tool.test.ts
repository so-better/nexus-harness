/**
 * read_artifact 测试：会话隔离、分页读取与错误处理。
 */

import { describe, expect, it } from 'vitest';
import type { ArtifactService } from '../artifacts/artifact-service';
import { runReadArtifactTool } from './read-artifact-tool';

/**
 * 构造只实现 readRange 的产物服务替身；sessionId 不匹配时返回 undefined。
 */
const fakeArtifacts = (content: string): ArtifactService =>
  ({
    readRange: async (sessionId: string, artifactId: string, offset: number, maxChars: number) => {
      if (sessionId !== 'session-1' || artifactId !== 'art-1') return undefined;
      return {
        artifactId,
        label: 'tool-grep',
        bytes: content.length,
        content: content.slice(offset, offset + maxChars),
        truncated: offset + maxChars < content.length
      };
    }
  }) as unknown as ArtifactService;

interface ArtifactSlice {
  content: string;
  truncated: boolean;
  hint?: string;
}

describe('read_artifact', () => {
  it('reads a paginated slice with a next offset hint', async () => {
    const result = await runReadArtifactTool(fakeArtifacts('x'.repeat(25_000)), 'session-1', {
      artifactId: 'art-1',
      maxChars: 10_000
    });

    expect(result.ok).toBe(true);
    const payload = JSON.parse(result.output) as ArtifactSlice;
    expect(payload.content).toHaveLength(10_000);
    expect(payload.truncated).toBe(true);
    expect(payload.hint).toContain('offset: 10000');
  });

  it('clamps the requested slice to the host character limit', async () => {
    const result = await runReadArtifactTool(
      fakeArtifacts('x'.repeat(100)),
      'session-1',
      { artifactId: 'art-1', maxChars: 100 },
      { maxCharsLimit: 10 }
    );

    const payload = JSON.parse(result.output) as ArtifactSlice;
    expect(payload.content).toHaveLength(10);
    expect(payload.truncated).toBe(true);
  });

  it('returns the remaining content on the next page', async () => {
    const result = await runReadArtifactTool(
      fakeArtifacts('a'.repeat(100) + 'b'.repeat(100)),
      'session-1',
      { artifactId: 'art-1', offset: 100, maxChars: 100 }
    );

    const payload = JSON.parse(result.output) as ArtifactSlice;
    expect(payload.content).toBe('b'.repeat(100));
    expect(payload.truncated).toBe(false);
  });

  it('rejects artifacts outside the current session', async () => {
    const result = await runReadArtifactTool(fakeArtifacts('data'), 'other-session', {
      artifactId: 'art-1'
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('ARTIFACT_NOT_FOUND');
  });

  it('rejects out-of-range offsets and invalid input', async () => {
    const outOfRange = await runReadArtifactTool(fakeArtifacts('abc'), 'session-1', {
      artifactId: 'art-1',
      offset: 10
    });
    expect(outOfRange.error?.code).toBe('ARTIFACT_OFFSET_OUT_OF_RANGE');

    const invalid = await runReadArtifactTool(fakeArtifacts('abc'), 'session-1', {
      artifactId: ''
    });
    expect(invalid.error?.code).toBe('TOOL_INPUT_INVALID');
  });
});
