/**
 * Provider 配置存储：一个服务商可配置多个模型，API Key 随本地配置明文保存。
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  AgentProviderConfig,
  ProviderModel,
  ProviderProtocol,
  ProviderPublic,
  ProviderSettings
} from '@shared/ipc/contracts';
import {
  findReservedProviderParams,
  findSensitiveProviderParams,
  isValidReasoningField
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
  apiKey?: string;
  headers?: Record<string, string>;
}

interface ProviderFile {
  version: 1;
  providers: StoredProvider[];
}

const emptyFile = (): ProviderFile => ({ version: 1, providers: [] });

/**
 * 过滤保留/敏感字段；用于读取手工编辑过的模型额外参数。
 */
function publicExtraParams(params: Record<string, unknown>): Record<string, unknown> | undefined {
  const entries = Object.entries(params).filter(
    ([key]) =>
      !findReservedProviderParams({ [key]: true }).length &&
      !findSensitiveProviderParams({ [key]: true }).length
  );
  return entries.length ? Object.fromEntries(entries) : undefined;
}

/**
 * 归一化模型列表：过滤无效模型，并清理额外参数中的保留/敏感字段。
 */
const normalizeModels = (provider: StoredProvider): ProviderModel[] =>
  (Array.isArray(provider.models) ? provider.models : [])
    .filter(
      (model) =>
        model &&
        typeof model.id === 'string' &&
        Number.isFinite(model.contextWindow) &&
        Number.isFinite(model.maxOutputTokens) &&
        model.contextWindow > 0 &&
        model.maxOutputTokens > 0 &&
        model.maxOutputTokens < model.contextWindow
    )
    .map((model) => ({
      id: model.id,
      contextWindow: model.contextWindow,
      maxOutputTokens: model.maxOutputTokens,
      ...(model.extraParams ? { extraParams: publicExtraParams(model.extraParams) } : {}),
      ...(model.role ? { role: model.role } : {}),
      ...(model.reasoningPassback === undefined
        ? {}
        : { reasoningPassback: model.reasoningPassback }),
      ...(model.reasoningField ? { reasoningField: model.reasoningField } : {}),
      ...(model.reasoningAllowUnsigned === undefined
        ? {}
        : { reasoningAllowUnsigned: model.reasoningAllowUnsigned }),
      ...(model.cacheTtl === undefined ? {} : { cacheTtl: model.cacheTtl })
    }));

const toPublic = (provider: StoredProvider): ProviderPublic => {
  const models = normalizeModels(provider);
  const defaultModelId = models.some((model) => model.id === provider.defaultModelId)
    ? (provider.defaultModelId as string)
    : (models[0]?.id ?? '');
  return {
    id: provider.id,
    protocol: provider.protocol ?? 'openai',
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey ?? '',
    ...(provider.headers && Object.keys(provider.headers).length
      ? { headers: provider.headers }
      : {}),
    enabled: provider.enabled,
    models,
    defaultModelId
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

      return {
        version: 1,
        providers: providers.filter((item): item is StoredProvider => {
          if (!item || typeof item !== 'object') return false;
          const record = item as Record<string, unknown>;
          return (
            typeof record['id'] === 'string' &&
            typeof record['name'] === 'string' &&
            typeof record['baseUrl'] === 'string' &&
            typeof record['enabled'] === 'boolean' &&
            typeof record['apiKey'] === 'string'
          );
        })
      };
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
    if (!apiKey) throw new Error('保存 Provider 需要 API Key');

    const headers = input.headers !== undefined ? input.headers : existing?.headers;
    for (const model of input.models) {
      // Anthropic 不使用字段名（固定 thinking block），跳过校验
      if (protocol !== 'anthropic' && !isValidReasoningField(model.reasoningField)) {
        throw new Error(`思考内容字段不合法：${model.reasoningField}`);
      }
      if (!model.extraParams) continue;
      // thinking / reasoning_effort 等思考参数直接写在 extraParams 中，由用户按模型自行配置
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
      ...(headers && Object.keys(headers).length ? { headers } : {})
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

    return toPublic(provider);
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
