/**
 * Provider 额外请求参数 JSON 解析：只接受普通对象。
 */

/**
 * 解析文本为 JSON 对象；空文本返回空对象。
 */
export const parseExtraParams = (text: string, invalidMessage: string): Record<string, unknown> => {
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(invalidMessage);
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(invalidMessage);
  }
};
