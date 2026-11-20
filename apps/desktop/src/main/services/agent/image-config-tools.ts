/**
 * 生图模型配置工具：读写 image.json，但任何面向模型的输入/输出都经过脱敏。
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AgentToolDefinition, ToolExecutionResult } from '@nexus/core';
import { imageTemplateSchema, type ImageConfig, type ImageTemplate } from '@shared/image';
import { loadImageSettings, saveImageSettings } from '../settings/image-settings';

const API_KEY_PLACEHOLDER = '{{api_key}}';
const MASK = '••••';
const SENSITIVE_KEYS = new Set([
  'apikey',
  'api_key',
  'authorization',
  'authtoken',
  'accesstoken',
  'token',
  'secret',
  'password',
  'xapikey',
  'x_api_key'
]);

const normalizeKey = (key: string): string => key.replace(/[_-]/g, '').toLowerCase();

const isSensitiveKey = (key: string): boolean => SENSITIVE_KEYS.has(normalizeKey(key));

/**
 * 统一脱敏：长值保留首尾少量字符，短值完全遮蔽。
 */
export const maskSecret = (value: string): string =>
  value.length > 8 ? `${value.slice(0, 3)}${MASK}${value.slice(-4)}` : MASK;

const allowedSensitiveValue = (key: string, value: string): boolean => {
  const normalized = normalizeKey(key);
  const trimmed = value.trim();
  if (trimmed === API_KEY_PLACEHOLDER) return true;
  return (
    normalized === 'authorization' &&
    /^Bearer\s+\{\{api_key\}\}$/i.test(trimmed)
  );
};

const redactUrl = (value: string): string => {
  if (!/^https?:\/\//i.test(value)) return redactString(value);
  try {
    const url = new URL(value);
    if (url.username) url.username = MASK;
    if (url.password) url.password = MASK;
    for (const key of [...url.searchParams.keys()]) {
      if (isSensitiveKey(key)) url.searchParams.set(key, MASK);
    }
    return url.toString();
  } catch {
    return redactString(value);
  }
};

const redactString = (value: string): string => {
  if (value.includes(API_KEY_PLACEHOLDER)) return value;
  if (/^Bearer\s+\S+/i.test(value)) return `Bearer ${maskSecret(value.replace(/^Bearer\s+/i, ''))}`;
  if (/^sk-[A-Za-z0-9_-]{8,}/.test(value)) return maskSecret(value);
  return value;
};

const redactValue = (value: unknown, parentKey?: string): unknown => {
  if (typeof value === 'string') {
    if (parentKey && isSensitiveKey(parentKey)) {
      if (value.includes(API_KEY_PLACEHOLDER)) return value;
      return normalizeKey(parentKey) === 'authorization'
        ? `Bearer ${API_KEY_PLACEHOLDER}`
        : API_KEY_PLACEHOLDER;
    }
    return redactUrl(value);
  }
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        redactValue(item, key)
      ])
    );
  }
  return value;
};

const assertNoSecrets = (value: unknown, path = 'template'): void => {
  if (typeof value === 'string') {
    if (/^\s*Bearer\s+(?!\{\{api_key\}\})/i.test(value) || /^\s*sk-[A-Za-z0-9_-]{8,}/.test(value)) {
      throw new Error(`${path} 包含原始密钥，请改用 ${API_KEY_PLACEHOLDER}`);
    }
    if (/^https?:\/\//i.test(value)) {
      try {
        const url = new URL(value);
        if (url.username || url.password) {
          throw new Error(`${path} 不能包含 URL 凭据，请改用 ${API_KEY_PLACEHOLDER}`);
        }
        for (const [key, item] of url.searchParams) {
          if (isSensitiveKey(key) && !allowedSensitiveValue(key, item)) {
            throw new Error(`${path} 的 ${key} 参数包含原始敏感信息，请改用 ${API_KEY_PLACEHOLDER}`);
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('请改用')) throw error;
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecrets(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      if (typeof item !== 'string' || !allowedSensitiveValue(key, item)) {
        throw new Error(`${path}.${key} 包含原始敏感信息，请改用 ${API_KEY_PLACEHOLDER}`);
      }
      continue;
    }
    assertNoSecrets(item, `${path}.${key}`);
  }
};

/**
 * 对工具输入做深度脱敏，供 tool.requested 与审批详情展示。
 */
export const sanitizeImageConfigInput = (name: string, input: unknown): unknown => {
  if (!name.startsWith('image_config_') || !input || typeof input !== 'object') return input;
  return redactValue(input);
};

const redactTemplate = (template: ImageTemplate): ImageTemplate =>
  redactValue(template) as ImageTemplate;

const redactConfig = (config: ImageConfig): Record<string, unknown> => ({
  ...config,
  ...(config.apiKey ? { apiKey: maskSecret(config.apiKey) } : { apiKey: null }),
  hasApiKey: Boolean(config.apiKey),
  template: redactTemplate(config.template)
});

const imageConfigListSchema = z.object({}).strict();
const imageConfigTargetSchema = z
  .object({
    id: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    model: z.string().min(1).optional()
  })
  .strict()
  .refine((value) => Boolean(value.id || value.name || value.model), {
    message: '需要 id、name 或 model'
  });
const imageConfigSaveSchema = z
  .object({
    id: z.string().min(1).optional(),
    name: z.string().min(1),
    model: z.string().min(1),
    enabled: z.boolean().optional(),
    template: z.unknown()
  })
  .strict();
const imageConfigToggleSchema = imageConfigTargetSchema.and(
  z.object({ enabled: z.boolean() })
);
const imageConfigDeleteSchema = imageConfigTargetSchema;

const tool = (
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
  requiresApproval: boolean
): AgentToolDefinition => ({
  name,
  description,
  permission: requiresApproval ? 'write' : 'read',
  requiresApproval,
  inputSchema: { type: 'object', properties, required, additionalProperties: false }
});

export const imageConfigToolDefinitions: AgentToolDefinition[] = [
  tool('image_config_list', '列出生图模型配置；API Key 与敏感模板值只返回脱敏值。', {}, [], false),
  tool(
    'image_config_get',
    '读取一个生图模型配置；API Key 与敏感 template 值只返回脱敏值。',
    {
      id: { type: 'string', description: '配置 id' },
      name: { type: 'string', description: '配置名称' },
      model: { type: 'string', description: '模型名' }
    },
    [],
    false
  ),
  tool(
    'image_config_save',
    `新建或更新生图模型配置。禁止传入原始 API Key 或敏感 template 值；需要 Key 时使用 ${API_KEY_PLACEHOLDER}，由用户手动填写真实 Key。`,
    {
      id: { type: 'string', description: '更新已有配置时传入' },
      name: { type: 'string' },
      model: { type: 'string' },
      enabled: { type: 'boolean' },
      template: { type: 'object', additionalProperties: true }
    },
    ['name', 'model', 'template'],
    true
  ),
  tool(
    'image_config_toggle',
    '启用或停用生图模型配置。',
    {
      id: { type: 'string' },
      name: { type: 'string' },
      model: { type: 'string' },
      enabled: { type: 'boolean' }
    },
    ['enabled'],
    true
  ),
  tool(
    'image_config_delete',
    '删除生图模型配置；不会删除已生成的图片。',
    {
      id: { type: 'string' },
      name: { type: 'string' },
      model: { type: 'string' }
    },
    [],
    true
  )
];

const failure = (code: string, message: string): ToolExecutionResult => ({
  ok: false,
  output: '',
  error: { code, message }
});

const success = (value: unknown): ToolExecutionResult => ({
  ok: true,
  output: JSON.stringify(value)
});

const findConfig = (
  configs: ImageConfig[],
  target: { id?: string | undefined; name?: string | undefined; model?: string | undefined }
): ImageConfig | undefined =>
  target.id
    ? configs.find((item) => item.id === target.id)
    : target.name
      ? configs.find((item) => item.name === target.name)
      : configs.find((item) => item.model === target.model);

const loadConfigs = async (settingsDir?: string): Promise<ImageConfig[]> =>
  (await loadImageSettings(settingsDir))?.configs ?? [];

const saveConfigs = async (configs: ImageConfig[], settingsDir?: string): Promise<void> => {
  await saveImageSettings({ configs }, settingsDir);
};

/**
 * 执行生图配置工具；所有读取都脱敏，所有写入都先禁止原始敏感值。
 */
export const executeImageConfigTool = async (
  name: string,
  input: unknown,
  settingsDir?: string
): Promise<ToolExecutionResult> => {
  const configs = await loadConfigs(settingsDir);

  if (name === 'image_config_list') {
    if (!imageConfigListSchema.safeParse(input).success) return failure('IMAGE_CONFIG_INVALID_INPUT', '参数不合法');
    return success({ configs: configs.map(redactConfig) });
  }

  if (name === 'image_config_get') {
    const parsed = imageConfigTargetSchema.safeParse(input);
    if (!parsed.success) return failure('IMAGE_CONFIG_INVALID_INPUT', '参数不合法');
    const config = findConfig(configs, parsed.data);
    if (!config) return failure('IMAGE_CONFIG_NOT_FOUND', '生图配置不存在，可用 image_config_list 查询 id/name/model');
    return success(redactConfig(config));
  }

  if (name === 'image_config_save') {
    const parsed = imageConfigSaveSchema.safeParse(input);
    if (!parsed.success) return failure('IMAGE_CONFIG_INVALID_INPUT', '参数不合法');
    try {
      assertNoSecrets(parsed.data.template);
    } catch (error) {
      return failure('IMAGE_CONFIG_SECRET_REJECTED', error instanceof Error ? error.message : '配置包含敏感信息');
    }
    const template = imageTemplateSchema.safeParse(parsed.data.template);
    if (!template.success) return failure('IMAGE_CONFIG_INVALID_TEMPLATE', '生图模板不合法');
    const rawTemplate = parsed.data.template as Record<string, unknown>;

    const existing = parsed.data.id ? configs.find((item) => item.id === parsed.data.id) : undefined;
    // AI 未提供 headers 时保留用户手动填写的认证头；显式传空对象才表示清空
    if (!Object.prototype.hasOwnProperty.call(rawTemplate, 'headers') && existing?.template.headers) {
      template.data.headers = existing.template.headers;
    }
    const config: ImageConfig = {
      id: parsed.data.id ?? randomUUID(),
      name: parsed.data.name,
      model: parsed.data.model,
      enabled: parsed.data.enabled ?? existing?.enabled ?? true,
      template: template.data,
      ...(existing?.apiKey ? { apiKey: existing.apiKey } : {})
    };
    const next = existing
      ? configs.map((item) => (item.id === config.id ? config : item))
      : [...configs, config];
    await saveConfigs(next, settingsDir);
    return success({ config: redactConfig(config), needsApiKey: !config.apiKey });
  }

  if (name === 'image_config_toggle') {
    const parsed = imageConfigToggleSchema.safeParse(input);
    if (!parsed.success) return failure('IMAGE_CONFIG_INVALID_INPUT', '参数不合法');
    const existing = findConfig(configs, parsed.data);
    if (!existing) return failure('IMAGE_CONFIG_NOT_FOUND', '生图配置不存在');
    const config = { ...existing, enabled: parsed.data.enabled };
    await saveConfigs(configs.map((item) => (item.id === config.id ? config : item)), settingsDir);
    return success({ config: redactConfig(config) });
  }

  if (name === 'image_config_delete') {
    const parsed = imageConfigDeleteSchema.safeParse(input);
    if (!parsed.success) return failure('IMAGE_CONFIG_INVALID_INPUT', '参数不合法');
    const existing = findConfig(configs, parsed.data);
    if (!existing) return failure('IMAGE_CONFIG_NOT_FOUND', '生图配置不存在');
    await saveConfigs(configs.filter((item) => item.id !== existing.id), settingsDir);
    return success({ deleted: existing.id, name: existing.name });
  }

  return failure('IMAGE_CONFIG_UNKNOWN_ACTION', `未知生图配置操作：${name}`);
};
