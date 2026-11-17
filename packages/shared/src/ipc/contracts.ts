/* 跨进程契约：应用级 IPC 的 zod schema 与 preload 桥接类型。 */

import { z } from 'zod';
import type { Result } from './result';

/* 应用基础信息，用于确认渲染进程与主进程通道可用。 */
export const appInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  platform: z.string()
});

export type AppInfo = z.infer<typeof appInfoSchema>;

/* preload 暴露到 window.nexus 的桥接接口。 */
export interface NexusBridge {
  app: {
    getInfo: () => Promise<Result<AppInfo>>;
  };
}
