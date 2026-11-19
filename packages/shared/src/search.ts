/**
 * 媒体搜索配置：当前仅支持 Pexels API Key。
 */

import { z } from 'zod';

export const searchSettingsSchema = z.object({
  pexelsApiKey: z.string().optional()
});

export type SearchSettings = z.infer<typeof searchSettingsSchema>;
