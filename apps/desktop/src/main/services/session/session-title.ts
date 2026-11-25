/**
 * 自动会话标题：用当前模型总结首条用户消息，失败时回退为截断文本。
 */

import type { ChatProvider } from '@nexus/providers';
import { stripManagedThinkingParams, type UsageSummary } from '@nexus/shared';

const TITLE_TIMEOUT_MS = 10_000;
const MAX_TITLE_LENGTH = 32;

/**
 * 清理模型返回的标题，去掉 Markdown、引号与多余空白。
 */
export const sanitizeTitle = (value: string): string =>
  value
    .replace(/^#+\s*/, '')
    .replace(/["'“”‘’]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TITLE_LENGTH);

/**
 * 用户消息的兜底标题。
 */
export const fallbackTitle = (prompt: string): string => {
  const line = prompt.split(/\r?\n/)[0]?.trim() ?? '';
  return sanitizeTitle(line) || '新会话';
};

/**
 * 生成标题；网络或输出异常时始终返回可用的兜底标题。
 */
export const generateSessionTitle = async (
  provider: ChatProvider,
  model: string,
  prompt: string,
  extraParams?: Record<string, unknown>
): Promise<{ title: string; usage?: UsageSummary }> => {
  const fallback = fallbackTitle(prompt);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TITLE_TIMEOUT_MS);

  try {
    let text = '';
    let usage: UsageSummary | undefined;

    const utilityExtraParams = stripManagedThinkingParams(extraParams);
    for await (const event of provider.stream({
      model,
      maxTokens: 64,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            '你是会话标题生成器。根据用户第一条消息生成简洁、具体、可区分的标题，使用用户消息的主要语言，最多 16 个汉字或 32 个字符；不要输出引号、句号、Markdown 或解释，只输出标题。'
        },
        { role: 'user', content: prompt.slice(0, 2_000) }
      ],
      ...(utilityExtraParams ? { extraParams: utilityExtraParams } : {}),
      signal: controller.signal
    })) {
      if (event.type === 'text-delta') text += event.text;
      if (event.type === 'usage') usage = event.usage;
      if (event.type === 'error') return { title: fallback, ...(usage ? { usage } : {}) };
    }

    return { title: sanitizeTitle(text) || fallback, ...(usage ? { usage } : {}) };
  } catch {
    return { title: fallback };
  } finally {
    clearTimeout(timer);
  }
};
