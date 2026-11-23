/**
 * web_fetch：通过 AnySearch 读取公开网页正文。
 */

import { assertPublicUrl } from '@nexus/runtime-utils';
import { requestAnySearch } from '../../internal/anysearch';

interface AnySearchExtractData {
  url?: unknown;
  title?: unknown;
  content?: unknown;
}

/**
 * 读取网页正文；只接受 http/https，内容截断后返回，避免撑爆上下文。
 */
export const fetchWeb = async (url: string, apiKey?: string): Promise<string> => {
  const parsed = await assertPublicUrl(url);
  const data = await requestAnySearch<AnySearchExtractData>(
    '/v1/extract',
    { url: parsed.toString() },
    apiKey
  );
  const content = typeof data.content === 'string' ? data.content : '';
  if (!content.trim()) throw new Error('网页没有可读取的正文');
  return JSON.stringify({
    url: typeof data.url === 'string' ? data.url : parsed.toString(),
    title: typeof data.title === 'string' ? data.title : '',
    content: content.slice(0, 20_000)
  });
};
