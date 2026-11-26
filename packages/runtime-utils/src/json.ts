/**
 * JSON 规范化辅助：递归按键排序，保证序列化结果稳定。
 * 用于 prompt 前缀确定性（MCP 等外部 schema 的 key 顺序不应影响缓存前缀）。
 */

/**
 * 递归按键排序对象；数组保持元素顺序但递归处理元素；原始值原样返回。
 * 只排序对象 key，不重排数组（数组顺序可能承载语义，如 required、enum）。
 */
export const deepSortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(deepSortKeys);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = deepSortKeys(record[key]);
    }
    return sorted;
  }
  return value;
};
