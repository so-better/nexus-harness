/**
 * web_search：AnySearch 联网搜索；无 API Key 时走匿名限流，有 Key 时提升额度。
 */

import { requestAnySearch } from '../../internal/anysearch';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface AnySearchSearchData {
  results?: Array<{ title?: unknown; url?: unknown; snippet?: unknown }>;
}

const normalizeResults = (data: AnySearchSearchData): WebSearchResult[] =>
  (data.results ?? [])
    .map((item) => ({
      title: typeof item.title === 'string' ? item.title : '',
      url: typeof item.url === 'string' ? item.url : '',
      snippet: typeof item.snippet === 'string' ? item.snippet : ''
    }))
    .filter((item) => item.url);

/**
 * 调用 AnySearch 搜索；结果只保留标题、链接和摘要，避免把整页内容塞回上下文。
 */
export const searchWeb = async (query: string, count: number, apiKey?: string): Promise<string> => {
  const data = await requestAnySearch<AnySearchSearchData>(
    '/v1/search',
    {
      query: query.slice(0, 500),
      max_results: Math.min(10, Math.max(1, Math.round(count)))
    },
    apiKey
  );
  return JSON.stringify({ query, results: normalizeResults(data) });
};
