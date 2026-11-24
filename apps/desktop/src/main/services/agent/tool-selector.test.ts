/**
 * 通用工具筛选测试：内置与 MCP 使用同一套 BM25 + IDF 相关性算法。
 */

import { describe, expect, it } from 'vitest';
import {
  extractQueryTerms,
  isAmbiguousRecall,
  planAutoTools,
  selectScoredTools,
  selectToolsByRelevance,
  tokenize,
  tokenizeName,
  type ScoredTool,
  type SelectableTool
} from './tool-selector';

const make = (
  name: string,
  description: string,
  group: SelectableTool['group'] = 'core',
  source: SelectableTool['source'] = 'builtin'
): SelectableTool => ({
  name,
  description,
  group,
  source,
  permission: source === 'mcp' ? 'execute' : 'read',
  requiresApproval: false,
  inputSchema: { type: 'object', properties: {} }
});

const tools: SelectableTool[] = [
  make('read_file', '读取授权目录内的文本文件'),
  make('save_ppt', '生成 PowerPoint .pptx 文件', 'office'),
  make('mcp_github_search_repos', 'Search GitHub repositories', 'mcp', 'mcp'),
  make('mcp_filesystem_read', '读取文件系统中的文件内容', 'mcp', 'mcp')
];

describe('tool-selector', () => {
  it('matches built-in and MCP tools with the same algorithm', () => {
    const github = selectToolsByRelevance({ query: '搜索 github 仓库', candidates: tools });
    expect(github.map((tool) => tool.name)).toContain('mcp_github_search_repos');

    const file = selectToolsByRelevance({ query: '读取文件', candidates: tools });
    expect(file.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['read_file', 'mcp_filesystem_read'])
    );
  });

  it('returns nothing when no term matches', () => {
    expect(selectToolsByRelevance({ query: '你好', candidates: tools })).toEqual([]);
    expect(selectToolsByRelevance({ query: '', candidates: tools })).toEqual([]);
    expect(selectToolsByRelevance({ query: '搜索 github', candidates: [] })).toEqual([]);
  });

  it('caps the number of selected tools', () => {
    const many = Array.from({ length: 20 }, (_value, index) =>
      make(`tool_${index}`, 'shared keyword tool')
    );
    expect(
      selectToolsByRelevance({ query: 'shared keyword', candidates: many, maxTools: 3 })
    ).toHaveLength(3);
  });

  it('ranks name matches above description-only matches', () => {
    const nameMatch = make('github_tool', 'unrelated');
    const descriptionMatch = make('other_tool', 'github related work');
    const ranked = selectToolsByRelevance({
      query: 'github',
      candidates: [descriptionMatch, nameMatch]
    });
    expect(ranked[0]?.name).toBe('github_tool');
  });

  it('downweights ubiquitous terms via IDF', () => {
    // “生成”在两个工具里都出现，具体术语“ppt”只出现在其中一个
    const common = make('save_word', '生成 Word 文档', 'office');
    const specific = make('save_ppt', '生成 PPT 幻灯片', 'office');
    const ranked = selectToolsByRelevance({ query: '生成 ppt', candidates: [common, specific] });
    expect(ranked[0]?.name).toBe('save_ppt');
  });

  it('tokenizes names, text and query consistently', () => {
    expect(tokenizeName('mcp_github_search_repos')).toEqual(['mcp', 'github', 'search', 'repos']);
    expect(tokenize('读取文件')).toContain('文件');
    expect(extractQueryTerms('use the file')).not.toContain('the');
    expect(extractQueryTerms('use the file')).toContain('file');
  });

  it('returns scored candidates sorted by relevance', () => {
    const scored = selectScoredTools({ query: 'github', candidates: tools });
    expect(scored[0]?.tool.name).toBe('mcp_github_search_repos');
    expect(scored[0]?.score).toBeGreaterThan(0);
  });

  it('flags ambiguous Top-K boundaries only when scores are close', () => {
    const tool = make('tool', 'desc');
    const scored = (scores: number[]): ScoredTool[] => scores.map((score) => ({ tool, score }));

    expect(isAmbiguousRecall(scored([10, 9, 3, 2]), 2)).toBe(false);
    expect(isAmbiguousRecall(scored([10, 5, 4.9, 4.8]), 2)).toBe(true);
    expect(isAmbiguousRecall(scored([10, 5, 5]), 2)).toBe(true);
    // 候选不足 K 时不存在边界歧义
    expect(isAmbiguousRecall(scored([10, 5]), 5)).toBe(false);
  });

  it('plans direct injection on clear gaps and rerank on close scores', () => {
    const tool = make('tool', 'desc');
    const scored = (scores: number[]): ScoredTool[] => scores.map((score) => ({ tool, score }));

    const clear = planAutoTools(scored([10, 9, 3, 2]), 2);
    expect(clear.kind).toBe('direct');
    if (clear.kind === 'direct') expect(clear.tools).toHaveLength(2);

    const close = planAutoTools(scored([10, 5, 4.9, 4.8]), 2);
    expect(close.kind).toBe('rerank');
    if (close.kind === 'rerank') expect(close.shortlist).toHaveLength(4);

    const few = planAutoTools(scored([10, 5]), 5);
    expect(few.kind).toBe('direct');
    if (few.kind === 'direct') expect(few.tools).toHaveLength(2);
  });
});
