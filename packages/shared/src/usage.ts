/* 单条消息或单次调用的用量摘要，供 UI 与插件共享。 */

export interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  cost?: number;
}
