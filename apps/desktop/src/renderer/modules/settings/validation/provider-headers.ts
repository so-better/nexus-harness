/**
 * Provider 自定义请求头 JSON 解析：只接受字符串键值对象。
 */

/**
 * 解析文本为请求头对象；空文本返回空对象，非法结构抛出带提示的错误。
 */
export const parseHeaders = (text: string, invalidMessage: string): Record<string, string> => {
  if (!text.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(invalidMessage);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(invalidMessage);
  }
  const entries = Object.entries(parsed as Record<string, unknown>);
  for (const [, value] of entries) {
    if (typeof value !== 'string') throw new Error(invalidMessage);
  }
  return Object.fromEntries(entries) as Record<string, string>;
};
