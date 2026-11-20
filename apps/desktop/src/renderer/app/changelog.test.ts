// @vitest-environment node
/**
 * 双语文案一致性：两份 CHANGELOG 的版本标题必须保持同步。
 */
import { describe, expect, it } from 'vitest';
import english from '../../../../../CHANGELOG.md?raw';
import chinese from '../../../../../CHANGELOG.zh-CN.md?raw';

const versions = (content: string): string[] =>
  [...content.matchAll(/^## \[([^\]]+)\]/gm)].map((match) => match[1] ?? '');

const sectionCounts = (content: string): number[] =>
  content
    .split(/^## \[[^\]]+\]/gm)
    .slice(1)
    .map((section) => (section.match(/^### /gm) ?? []).length);

describe('changelog translations', () => {
  it('keeps the same version headings in English and Chinese', () => {
    expect(versions(chinese)).toEqual(versions(english));
  });

  it('keeps the same section structure and has content', () => {
    expect(sectionCounts(chinese)).toEqual(sectionCounts(english));
    expect(english).toContain('## [Unreleased]');
    expect(chinese).toContain('## [Unreleased]');
  });
});
