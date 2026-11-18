/**
 * IPC 结果解包：统一把 Result 转为数据或抛出可展示错误。
 */

import type { Result } from '@shared/ipc/result';

/**
 * 成功时返回 data，失败时抛出 Error；调用方负责展示错误。
 */
export const unwrap = <T>(result: Result<T>): T => {
  if (result.ok) return result.data;
  throw new Error(result.error.message);
};
