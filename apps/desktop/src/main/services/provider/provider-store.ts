/**
 * Provider 配置存储：一个服务商可配置多个模型，API Key 随本地配置明文保存。
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { safeStorage } from 'electron';
import type {
  AgentProviderConfig,
  ProviderModel,
  ProviderProtocol,
  ProviderPublic,
  ProviderSettings
} from '@shared/ipc/contracts';
import { DEFAULT_CONTEXT_WINDOW, DEFAULT_MAX_OUTPUT_TOKENS } from '@nexus/core';
import {
  findManagedThinkingParams,
  findReservedProviderParams,
  findSensitiveProviderParams
} from '@shared/provider-params';
import { getAppDataPaths } from '../storage/paths';

interface StoredProvider {
  id: string;
  protocol?: ProviderProtocol;
  name: string;
  baseUrl: string;
  enabled: boolean;
  models?: ProviderModel[];
  defaultModelId?: string;
  model?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  apiKey?: string;
  headers?: Record<string, string>;
  extraParams?: Record<string, unknown>;
  reasoningPassback?: boolean;
  encryptedApiKey?: string;
  encryptedHeaders?: string;
  encryptedExtraParams?: string;
}

interface ProviderFile {
  version: 1;
  providers: StoredProvider[];
}

const emptyFile = (): ProviderFile => ({ version: 1, providers: [] });

const defaultMaxOutput = (contextWindow: number): number =>
  Math.min(DEFAULT_MAX_OUTPUT_TOKENS, Math.max(256, Math.floor(contextWindow / 4)));

/**
 * 把旧版单模型配置迁移为模型数组。
 */
const normalizeModels = (
  provider: StoredProvider
): {
  models: ProviderModel[];
  defaultModelId: string;
} => {
  const models = Array.isArray(provider.models)
    ? provider.models.filter(
        (model) =>
          model &&
          typeof model.id === 'string' &&
          Number.isFinite(model.contextWindow) &&
          Number.isFinite(model.maxOutputTokens) &&
          model.contextWindow > 0 &&
          model.maxOutputTokens > 0 &&
          model.maxOutputTokens < model.contextWindow
      )
    : [];

  if (models.length > 0) {
    const cleanModels = models.map((model) => ({
      id: model.id,
      contextWindow: model.contextWindow,
      // 思考模式会占用输出预算；旧默认 4096 不足以容纳 reasoning + 正文/工具参数
      maxOutputTokens:
        model.thinkingMode === 'enabled' && model.maxOutputTokens === 4096
          ? Math.min(16_384, Math.max(256, model.contextWindow - 1024))
          : model.maxOutputTokens,
      ...(model.extraParams ? { extraParams: publicExtraParams(model.extraParams) } : {}),
      ...(model.role ? { role: model.role } : {}),
      ...(model.endpoint ? { endpoint: model.endpoint } : {}),
      ...(model.thinkingMode === undefined ? {} : { thinkingMode: model.thinkingMode }),
      ...(model.reasoningEffort === undefined ? {} : { reasoningEffort: model.reasoningEffort }),
      ...(model.reasoningPassback === undefined
        ? {}
        : { reasoningPassback: model.reasoningPassback })
    }));
    const defaultModelId = models.some((model) => model.id === provider.defaultModelId)
      ? (provider.defaultModelId as string)
      : models[0]!.id;
    return { models: cleanModels, defaultModelId };
  }

  if (provider.model) {
    const contextWindow = provider.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
    const maxOutputTokens = provider.maxOutputTokens ?? defaultMaxOutput(contextWindow);
    return {
      models: [{ id: provider.model, contextWindow, maxOutputTokens }],
      defaultModelId: provider.model
    };
  }

  return { models: [], defaultModelId: '' };
};

/**
 * 读取旧版 safeStorage 加密值；仅用于把历史配置迁移为本地明文。
 */
const decryptLegacy = (value: string): string => {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('无法读取旧版加密配置');
  return safeStorage.decryptString(Buffer.from(value, 'base64'));
};

/**
 * 读取旧版 JSON 加密字段；仅用于历史配置迁移。
 */
const decryptLegacyJson = <T>(value: string): T => JSON.parse(decryptLegacy(value)) as T;

/**
 * 把旧版加密字段就地迁移为明文；返回是否发生变更。
 */
const migrateLegacySecrets = (provider: StoredProvider): boolean => {
  let changed = false;

  if (!provider.apiKey && provider.encryptedApiKey) {
    provider.apiKey = decryptLegacy(provider.encryptedApiKey);
    delete provider.encryptedApiKey;
    changed = true;
  }
  if (!provider.headers && provider.encryptedHeaders) {
    provider.headers = decryptLegacyJson<Record<string, string>>(provider.encryptedHeaders);
    delete provider.encryptedHeaders;
    changed = true;
  }
  if (!provider.extraParams && provider.encryptedExtraParams) {
    provider.extraParams = decryptLegacyJson<Record<string, unknown>>(
      provider.encryptedExtraParams
    );
    delete provider.encryptedExtraParams;
    changed = true;
  }

  return changed;
};

function publicExtraParams(params: Record<string, unknown>): Record<string, unknown> | undefined {
  const entries = Object.entries(params).filter(
    ([key]) =>
      !findReservedProviderParams({ [key]: true }).length &&
      !findSensitiveProviderParams({ [key]: true }).length
  );
  return entries.length ? Object.fromEntries(entries) : undefined;
}

/**
 * 把旧 Provider 级 extraParams/reasoningPassback 迁移到每个模型。
 */
const migrateLegacyProviderParams = (provider: StoredProvider): boolean => {
  let changed = false;
  if (provider.extraParams) {
    for (const model of provider.models ?? []) {
      if (model.extraParams === undefined) model.extraParams = { ...provider.extraParams };
    }
    delete provider.extraParams;
    changed = true;
  }
  if (provider.reasoningPassback !== undefined) {
    for (const model of provider.models ?? []) {
      if (model.reasoningPassback === undefined) {
        model.reasoningPassback = provider.reasoningPassback;
      }
    }
    delete provider.reasoningPassback;
    changed = true;
  }
  return changed;
};

const toPublic = (provider: StoredProvider): ProviderPublic => {
  const normalized = normalizeModels(provider);
  const protocol = provider.protocol ?? 'openai';
  const legacyExtra = provider.extraParams ? publicExtraParams(provider.extraParams) : undefined;
  const models = normalized.models.map((model) => ({
    ...model,
    ...(model.extraParams || !legacyExtra ? {} : { extraParams: legacyExtra }),
    ...(model.reasoningPassback === undefined && provider.reasoningPassback !== undefined
      ? { reasoningPassback: provider.reasoningPassback }
      : {})
  }));
  return {
    id: provider.id,
    protocol,
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey ?? '',
    enabled: provider.enabled,
    models,
    defaultModelId: normalized.defaultModelId
  };
};

/**
 * Provider 配置文件读写；baseDir 可注入用于测试。
 */
export class ProviderStore {
  constructor(private readonly baseDir?: string) {}

  private get directory(): string {
    return this.baseDir ?? getAppDataPaths().settings;
  }

  private get filePath(): string {
    return join(this.directory, 'providers.json');
  }

  private async readFile(): Promise<ProviderFile> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return emptyFile();

      const providers = 'providers' in parsed ? parsed.providers : undefined;
      if (!Array.isArray(providers)) return emptyFile();

      const file: ProviderFile = {
        version: 1,
        providers: providers.filter((item): item is StoredProvider => {
          if (!item || typeof item !== 'object') return false;
          const record = item as Record<string, unknown>;
          return (
            typeof record['id'] === 'string' &&
            typeof record['name'] === 'string' &&
            typeof record['baseUrl'] === 'string' &&
            typeof record['enabled'] === 'boolean' &&
            (typeof record['apiKey'] === 'string' || typeof record['encryptedApiKey'] === 'string')
          );
        })
      };

      let changed = false;
      for (const provider of file.providers) {
        try {
          changed = migrateLegacySecrets(provider) || changed;
          changed = migrateLegacyProviderParams(provider) || changed;
        } catch {
          // 单个旧配置无法迁移时保留原数据，不阻断其他 Provider
        }
      }
      if (changed) {
        try {
          await this.writeFile(file);
        } catch {
          // 迁移写回失败时仍返回内存中的明文配置，下次启动再试
        }
      }

      return file;
    } catch {
      return emptyFile();
    }
  }

  private async writeFile(file: ProviderFile): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, this.filePath);
  }

  /**
   * 列出配置，API Key 供本地设置页回显。
   */
  async list(): Promise<ProviderPublic[]> {
    const file = await this.readFile();
    return file.providers.map(toPublic).filter((provider) => provider.models.length > 0);
  }

  /**
   * 新增或更新配置；未提供 apiKey 时保留旧值。
   */
  async save(input: ProviderSettings): Promise<ProviderPublic> {
    const file = await this.readFile();
    const existing = input.id ? file.providers.find((item) => item.id === input.id) : undefined;
    if (input.id && !existing) throw new Error(`Provider 不存在：${input.id}`);

    const id = input.id ?? randomUUID();
    const defaultModelId = input.models.some((model) => model.id === input.defaultModelId)
      ? input.defaultModelId
      : input.models[0]!.id;

    const protocol = input.protocol ?? existing?.protocol ?? 'openai';
    const apiKey = input.apiKey || existing?.apiKey || '';
    if (!apiKey && protocol !== 'ollama') throw new Error('保存 Provider 需要 API Key');

    const headers = input.headers !== undefined ? input.headers : existing?.headers;
    for (const model of input.models) {
      if (!model.extraParams) continue;
      if (protocol !== 'anthropic') {
        const managed = findManagedThinkingParams(model.extraParams);
        if (managed.length) {
          throw new Error(`模型额外参数不能覆盖思考配置：${managed.join(', ')}`);
        }
      }
      const reserved = findReservedProviderParams(model.extraParams);
      if (reserved.length) throw new Error(`模型额外参数不能覆盖保留字段：${reserved.join(', ')}`);
      const sensitive = findSensitiveProviderParams(model.extraParams);
      if (sensitive.length)
        throw new Error(`模型额外参数不能包含敏感字段：${sensitive.join(', ')}`);
    }

    const provider: StoredProvider = {
      id,
      protocol,
      name: input.name,
      baseUrl: input.baseUrl,
      enabled: input.enabled ?? existing?.enabled ?? true,
      models: input.models,
      defaultModelId,
      apiKey,
      ...(headers === undefined ? {} : { headers })
    };

    if (existing) {
      file.providers = file.providers.map((item) => (item.id === id ? provider : item));
    } else {
      file.providers.push(provider);
    }

    await this.writeFile(file);
    return toPublic(provider);
  }

  /**
   * 读取完整配置，包含本地保存的 API Key。
   */
  async get(id: string): Promise<AgentProviderConfig | undefined> {
    const file = await this.readFile();
    const provider = file.providers.find((item) => item.id === id);
    if (!provider) return undefined;

    const publicConfig = toPublic(provider);

    return {
      ...publicConfig,
      ...(provider.headers ? { headers: provider.headers } : {})
    };
  }

  /**
   * 删除配置；不存在时视为成功。
   */
  async remove(id: string): Promise<void> {
    const file = await this.readFile();
    await this.writeFile({
      version: 1,
      providers: file.providers.filter((item) => item.id !== id)
    });
  }
}

/**
 * 主进程共享的单例；IPC 与 AgentService 使用同一份配置。
 */
export const providerStore = new ProviderStore();
