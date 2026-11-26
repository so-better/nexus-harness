/**
 * 独立图像模型配置：每个模型使用完整请求模板，支持同步与异步任务。
 */

import { z } from 'zod';

/**
 * 结果解析规则：从响应中提取图片地址或编码内容。
 */
export const imageResultSchema = z.object({
  format: z.enum(['auto', 'json', 'sse']).optional(),
  path: z.string().optional(),
  paths: z.array(z.string()).optional(),
  regex: z.string().optional(),
  encoding: z.enum(['auto', 'url', 'base64', 'binary']).optional()
});

/**
 * 异步任务的轮询规则：任务地址、状态字段与结果字段。
 */
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

/**
 * 请求模板：完整 URL、可选请求头/请求体，以及结果与轮询规则。
 */
export const imageTemplateSchema = z.object({
  url: z.string().url(),
  method: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
  result: imageResultSchema.optional(),
  poll: imagePollSchema.optional()
});

/**
 * 单个图像模型的配置。
 */
export const imageConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  model: z.string().min(1),
  apiKey: z.string().optional(),
  enabled: z.boolean(),
  template: imageTemplateSchema
});

/**
 * 图像模型设置：所有已配置模型的集合。
 */
export const imageSettingsSchema = z.object({
  configs: z.array(imageConfigSchema)
});

/** 请求模板类型。 */
export type ImageTemplate = z.infer<typeof imageTemplateSchema>;
/** 单个图像模型配置类型。 */
export type ImageConfig = z.infer<typeof imageConfigSchema>;
/** 图像模型设置类型。 */
export type ImageSettings = z.infer<typeof imageSettingsSchema>;
