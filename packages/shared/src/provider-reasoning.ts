/**
 * 思考模式能力判断：仅 DeepSeek thinking 模型使用专用 thinking/reasoning 参数。
 */

/**
 * 判断模型是否属于 DeepSeek thinking 能力；baseUrl 用于识别官方或代理地址。
 */
export const supportsDeepSeekThinking = (baseUrl: string, modelId: string): boolean => {
  const host = baseUrl
    .match(/^https?:\/\/([^/?#]+)/i)?.[1]
    ?.split(':')[0]
    ?.toLowerCase();
  if (host === 'deepseek.com' || host?.endsWith('.deepseek.com')) return true;
  return /^deepseek[-/]/i.test(modelId);
};
