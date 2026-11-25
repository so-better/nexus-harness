/**
 * 通用工具筛选：对内置工具与 MCP 工具使用同一套「名称 + 描述」相关性算法。
 * 采用 BM25 + IDF：压制泛词、抬升具体词，并做字段加权；仅依赖运行时工具元信息。
 */

import type { AgentToolDefinition } from '@nexus/core';
import type { ToolGroupId } from './tool-groups';

/**
 * 参与筛选的工具：在工具定义之外补充分组与来源，便于显式激活与调试。
 * extraText 只参与匹配，不注入模型。
 */
export interface SelectableTool extends AgentToolDefinition {
  group: ToolGroupId;
  source: 'builtin' | 'mcp';
  extraText?: string;
}

const ASCII_TERM = /[a-z0-9]{2,}/g;
const CJK_RUN = /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g;

/**
 * 常见英文停用词；避免泛词把无关工具全部命中。
 */
const ENGLISH_STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'you',
  'with',
  'this',
  'that',
  'from',
  'are',
  'can',
  'use',
  'please',
  'help',
  'into',
  'not'
]);

/**
 * 默认最多自动选取的工具数量（分组召回扩展前）。
 */
export const DEFAULT_MAX_SELECTED_TOOLS = 10;

/**
 * 字段权重：名称命中权重最高，描述与补充文本次之。
 */
const FIELD_NAME_WEIGHT = 3;
const FIELD_TEXT_WEIGHT = 1;
/**
 * BM25 参数。
 */
const BM25_K1 = 1.2;
const BM25_B = 0.75;

/**
 * 把文本切分为用于匹配的术语：英文按词，中文按 2-gram（短串额外保留整串）。
 */
export const tokenize = (text: string): string[] => {
  const lower = text.toLowerCase();
  const tokens: string[] = [];
  for (const match of lower.matchAll(ASCII_TERM)) tokens.push(match[0]);
  for (const match of lower.matchAll(CJK_RUN)) {
    const run = match[0];
    if (run.length < 2) continue;
    if (run.length <= 4) tokens.push(run);
    for (let index = 0; index < run.length - 1; index += 1) {
      tokens.push(run.slice(index, index + 2));
    }
  }
  return tokens;
};

/**
 * 工具名按分隔符拆分，避免 `mcp_github_search` 被当成单个词。
 */
export const tokenizeName = (name: string): string[] =>
  name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);

/**
 * 从用户输入中提取查询术语，过滤停用词。
 */
export const extractQueryTerms = (query: string): string[] =>
  [...new Set(tokenize(query))].filter((term) => !ENGLISH_STOPWORDS.has(term));

const countTokens = (tokens: readonly string[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
};

interface ToolDocument {
  tool: SelectableTool;
  name: Map<string, number>;
  text: Map<string, number>;
  extra: Map<string, number>;
  length: number;
}

const buildDocument = (tool: SelectableTool): ToolDocument => {
  const name = countTokens(tokenizeName(tool.name));
  const text = countTokens(tokenize(tool.description));
  const extra = countTokens(tokenize(tool.extraText ?? ''));
  let length = 0;
  for (const count of name.values()) length += count * FIELD_NAME_WEIGHT;
  for (const count of text.values()) length += count * FIELD_TEXT_WEIGHT;
  for (const count of extra.values()) length += count * FIELD_TEXT_WEIGHT;
  return { tool, name, text, extra, length };
};

/**
 * 词频加权：名称权重最高，描述与补充文本相同。
 */
const weightedFrequency = (document: ToolDocument, term: string): number => {
  const nameCount = document.name.get(term) ?? 0;
  const textCount = document.text.get(term) ?? 0;
  const extraCount = document.extra.get(term) ?? 0;
  return (
    nameCount * FIELD_NAME_WEIGHT + textCount * FIELD_TEXT_WEIGHT + extraCount * FIELD_TEXT_WEIGHT
  );
};

export interface SelectToolsOptions {
  query: string;
  candidates: readonly SelectableTool[];
  maxTools?: number;
}

/**
 * 带分数的候选，供 Top-K 边界歧义判断使用。
 */
export interface ScoredTool {
  tool: SelectableTool;
  score: number;
}

/**
 * Top-K 边界相对分差低于该比例时视为“模糊”，需要模型重排。
 */
export const AMBIGUITY_GAP_THRESHOLD = 0.25;

/**
 * 按 BM25 + IDF 从候选中打分并排序，返回前 maxTools 个（含分数）。
 * 算法与来源无关：内置工具与 MCP 工具走同一套名称/描述匹配。
 */
export const selectScoredTools = (options: SelectToolsOptions): ScoredTool[] => {
  const { query, candidates } = options;
  const maxTools = options.maxTools ?? DEFAULT_MAX_SELECTED_TOOLS;
  if (!candidates.length || maxTools <= 0) return [];

  const terms = extractQueryTerms(query);
  if (!terms.length) return [];

  const documents = candidates.map(buildDocument);
  const totalLength = documents.reduce((sum, document) => sum + document.length, 0);
  const averageLength = totalLength / documents.length || 1;

  // 文档频率：包含该术语的候选数量，用于计算 IDF
  const documentFrequency = new Map<string, number>();
  for (const term of terms) {
    let count = 0;
    for (const document of documents) {
      if (weightedFrequency(document, term) > 0) count += 1;
    }
    documentFrequency.set(term, count);
  }

  const total = documents.length;
  const scored: ScoredTool[] = [];
  for (const document of documents) {
    let score = 0;
    for (const term of terms) {
      const frequency = weightedFrequency(document, term);
      if (frequency === 0) continue;
      const df = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (total - df + 0.5) / (df + 0.5));
      const normalization = BM25_K1 * (1 - BM25_B + (BM25_B * document.length) / averageLength);
      score += idf * ((frequency * (BM25_K1 + 1)) / (frequency + normalization));
    }
    if (score > 0) scored.push({ tool: document.tool, score });
  }

  scored.sort((left, right) => right.score - left.score);
  return scored.slice(0, maxTools);
};

/**
 * 按相关性从候选中选出工具，返回按分数降序的前若干个。
 */
export const selectToolsByRelevance = (options: SelectToolsOptions): SelectableTool[] =>
  selectScoredTools(options).map((item) => item.tool);

/**
 * 判断召回在 Top-K 边界是否模糊：第 K 与第 K+1 的相对分差过小，或边界并列。
 * 只需要在同一查询内比较分差，因此不依赖 BM25 分数的绝对量纲。
 */
export const isAmbiguousRecall = (
  scored: readonly ScoredTool[],
  k: number,
  threshold = AMBIGUITY_GAP_THRESHOLD
): boolean => {
  if (k <= 0 || scored.length <= k) return false;
  const boundary = scored[k - 1];
  const next = scored[k];
  if (!boundary || !next || boundary.score <= 0) return false;
  const relativeGap = (boundary.score - next.score) / boundary.score;
  return relativeGap < threshold;
};

/**
 * 候选仅比 K 多出的余量小于该值时，重排收益有限却要付出一次模型调用与首字延迟，
 * 直接取 BM25 前 K 个即可。
 */
export const RERANK_MIN_EXTRA = 4;

/**
 * 自动工具的注入计划：分差清晰或候选余量很小时直接用 BM25，模糊且余量充足时交给模型重排。
 */
export type AutoToolPlan =
  { kind: 'direct'; tools: SelectableTool[] } | { kind: 'rerank'; shortlist: SelectableTool[] };

/**
 * 决定自动工具注入方式；只做决策、不调用模型，便于单测与复用。
 */
export const planAutoTools = (scored: readonly ScoredTool[], k: number): AutoToolPlan => {
  const tools = scored.map((item) => item.tool);
  if (scored.length <= k) return { kind: 'direct', tools };
  // 余量太小时重排对结果影响有限，跳过以省一次模型调用和首字延迟
  if (scored.length <= k + RERANK_MIN_EXTRA) {
    return { kind: 'direct', tools: tools.slice(0, k) };
  }
  return isAmbiguousRecall(scored, k)
    ? { kind: 'rerank', shortlist: tools }
    : { kind: 'direct', tools: tools.slice(0, k) };
};
