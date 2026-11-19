/**
 * 独立图像模型配置：每个模型使用完整请求模板，支持同步与异步任务。
 */

import { z } from 'zod';

export const imageResultSchema = z.object({
  format: z.enum(['auto', 'json', 'sse']).optional(),
  path: z.string().optional(),
  paths: z.array(z.string()).optional(),
  regex: z.string().optional(),
  encoding: z.enum(['auto', 'url', 'base64', 'binary']).optional()
});

export const imagePollSchema = z.object({
  path: z.string().min(1),
  method: z.string().optional(),
  id_path: z.string().min(1),
  id_paths: z.array(z.string()).optional(),
  status_path: z.string().min(1),
  status_paths: z.array(z.string()).optional(),
  success: z.array(z.string()).optional(),
  failed: z.array(z.string()).optional(),
  result_path: z.string().min(1),
  result_paths: z.array(z.string()).optional(),
  interval_ms: z.number().int().positive().optional(),
  timeout_ms: z.number().int().positive().optional()
});

export const imageTemplateSchema = z.object({
  url: z.string().url(),
  method: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
  result: imageResultSchema.optional(),
  poll: imagePollSchema.optional()
});

export const imageConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  model: z.string().min(1),
  apiKey: z.string().optional(),
  enabled: z.boolean(),
  template: imageTemplateSchema
});

export const imageSettingsSchema = z.object({
  configs: z.array(imageConfigSchema)
});

export type ImageResultConfig = z.infer<typeof imageResultSchema>;
export type ImagePollConfig = z.infer<typeof imagePollSchema>;
export type ImageTemplate = z.infer<typeof imageTemplateSchema>;
export type ImageConfig = z.infer<typeof imageConfigSchema>;
export type ImageSettings = z.infer<typeof imageSettingsSchema>;
