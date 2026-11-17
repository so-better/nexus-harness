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

/* 主题来源：跟随系统、强制浅色或强制深色。 */
export const themeSourceSchema = z.enum(['system', 'light', 'dark']);

/* 主题状态：source 为用户选择，effective 为当前实际生效主题。 */
export const themeInfoSchema = z.object({
  source: themeSourceSchema,
  effective: z.enum(['light', 'dark'])
});

export type ThemeSource = z.infer<typeof themeSourceSchema>;
export type ThemeInfo = z.infer<typeof themeInfoSchema>;

/* 取消订阅函数，preload 与插件 API 共用。 */
export type Unsubscribe = () => void;

/* preload 暴露到 window.nexus 的桥接接口。 */
export interface NexusBridge {
  app: {
    getInfo: () => Promise<Result<AppInfo>>;
  };
  theme: {
    getInfo: () => Promise<Result<ThemeInfo>>;
    setSource: (source: ThemeSource) => Promise<Result<ThemeInfo>>;
    onChange: (handler: (info: ThemeInfo) => void) => Unsubscribe;
  };
}
