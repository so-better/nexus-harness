/**
 * 工具重排：BM25 召回 top-N 后，用当前对话模型从候选中挑选最终 K 个工具。
 * 模型调用失败或输出非法时回退到 BM25 的前 K 个，保证不因重排失败而丢工具。
 */

import type { ChatProvider } from '@nexus/providers';
import type { UsageSummary } from '@nexus/shared';
import type { SelectableTool } from './tool-selector';

/**
 * 重排调用超时；避免工具筛选阻塞首 token。
 */
const RERANK_TIMEOUT_MS = 8_000;
/**
 * 单个工具描述在提示词中的截断长度。
 */
const MAX_DESCRIPTION_CHARS = 100;
/**
 * 用户请求在提示词中的截断长度。
 */
const MAX_QUERY_CHARS = 2_000;
/**
 * 重排输出上限，防止模型输出异常长文本。
 */
const MAX_OUTPUT_CHARS = 4_000;
/**
 * 重排输出 token 上限。
 */
const RERANK_MAX_TOKENS = 256;

export interface RerankToolsInput {
  provider: ChatProvider;
  model: string;
  query: string;
  candidates: readonly SelectableTool[];
  maxTools: number;
  extraParams?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface RerankToolsResult {
  selected: SelectableTool[];
  usage?: UsageSummary;
}

const truncate = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max)}…`;

/**
 * 从模型输出中解析工具名数组。
 * 返回 undefined 表示输出非法（需要回退）；返回空数组表示模型明确选择“不需要工具”。
 */
const parseSelection = (
  output: string,
  candidates: readonly SelectableTool[],
  maxTools: number
): SelectableTool[] | undefined => {
  const match = output.match(/\[[\s\S]*?\]/);
  if (!match) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(match[0]);
  } catch {
    return undefined;
  }
  if (!Array.isArray(raw)) return undefined;
  // 模型明确输出空数组：尊重“无需工具”的判断
  if (raw.length === 0) return [];

  const byName = new Map(candidates.map((tool) => [tool.name, tool]));
  const selected: SelectableTool[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string' || seen.has(item)) continue;
    const tool = byName.get(item);
    if (!tool) continue;
    seen.add(item);
    selected.push(tool);
    if (selected.length >= maxTools) break;
  }
  // 非空数组但没有任何名称命中候选，视为非法输出
  return selected.length ? selected : undefined;
};

/**
 * 用对话模型在候选工具中挑选最终 K 个；候选不超过 K 时直接返回，不调用模型。
 */
export const rerankTools = async (input: RerankToolsInput): Promise<RerankToolsResult> => {
  const { candidates, maxTools } = input;
  if (!candidates.length || maxTools <= 0) return { selected: [] };
  if (candidates.length <= maxTools) return { selected: [...candidates] };

  const listing = candidates
    .map((tool) => `${tool.name} — ${truncate(tool.description, MAX_DESCRIPTION_CHARS)}`)
    .join('\n');
  const query = truncate(input.query, MAX_QUERY_CHARS);

  const signals: AbortSignal[] = [AbortSignal.timeout(RERANK_TIMEOUT_MS)];
  if (input.signal) signals.push(input.signal);
  const signal = AbortSignal.any(signals);

  let output = '';
  let usage: UsageSummary | undefined;
  try {
    for await (const event of input.provider.stream({
      model: input.model,
      messages: [
        {
          role: 'system',
          content: `你是工具选择器。根据用户请求，从候选工具中选出完成该任务所需的工具，最多 ${maxTools} 个。只输出 JSON 字符串数组，元素必须来自候选工具名；不需要任何工具时输出 []。不要输出解释。`
        },
        { role: 'user', content: `用户请求：\n${query}\n\n候选工具：\n${listing}` }
      ],
      maxTokens: RERANK_MAX_TOKENS,
      temperature: 0,
      signal,
      ...(input.extraParams ? { extraParams: input.extraParams } : {})
    })) {
      if (event.type === 'text-delta') output += event.text;
      if (event.type === 'usage') usage = event.usage;
      if (event.type === 'error') break;
      if (output.length > MAX_OUTPUT_CHARS) break;
    }
  } catch {
    return { selected: candidates.slice(0, maxTools), ...(usage ? { usage } : {}) };
  }

  const selected = parseSelection(output, candidates, maxTools);
  // 非法输出回退；合法空数组表示模型明确不需要工具，予以尊重
  if (selected === undefined) {
    return { selected: candidates.slice(0, maxTools), ...(usage ? { usage } : {}) };
  }
  return { selected, ...(usage ? { usage } : {}) };
};
