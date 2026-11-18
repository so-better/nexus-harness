/**
 * Provider 配置存储：API Key 使用 safeStorage 加密，明文不落盘。
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { safeStorage } from 'electron';
import type { AgentProviderConfig, ProviderPublic, ProviderSettings } from '@shared/ipc/contracts';
import { DEFAULT_CONTEXT_WINDOW, DEFAULT_MAX_OUTPUT_TOKENS } from '@nexus/core';
import { getAppDataPaths } from '../storage/paths';

interface StoredProvider {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  enabled: boolean;
  contextWindow?: number;
  maxOutputTokens?: number;
  encryptedApiKey: string;
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
 * 加密/解密 API Key；系统安全存储不可用时明确失败。
 */
const encryptKey = (apiKey: string): string => {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('系统安全存储不可用');
  return safeStorage.encryptString(apiKey).toString('base64');
};

const decryptKey = (encrypted: string): string => {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('系统安全存储不可用');
  return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
};

const encryptJson = (value: unknown): string => encryptKey(JSON.stringify(value));

const decryptJson = <T>(encrypted: string): T => JSON.parse(decryptKey(encrypted)) as T;

const toPublic = (provider: StoredProvider): ProviderPublic => ({
  id: provider.id,
  name: provider.name,
  baseUrl: provider.baseUrl,
  model: provider.model,
  enabled: provider.enabled,
  contextWindow: provider.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
  maxOutputTokens:
    provider.maxOutputTokens ?? defaultMaxOutput(provider.contextWindow ?? DEFAULT_CONTEXT_WINDOW)
});

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
            typeof record['model'] === 'string' &&
            typeof record['enabled'] === 'boolean' &&
            typeof record['encryptedApiKey'] === 'string'
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
   * 列出公开配置，不解密 API Key。
   */
  async list(): Promise<ProviderPublic[]> {
    const file = await this.readFile();
    return file.providers.map(toPublic);
  }

  /**
   * 新增或更新配置；未提供 apiKey 时保留旧密钥。
   */
  async save(input: ProviderSettings): Promise<ProviderPublic> {
    const file = await this.readFile();
    const existing = input.id ? file.providers.find((item) => item.id === input.id) : undefined;
    if (input.id && !existing) throw new Error(`Provider 不存在：${input.id}`);

    const id = input.id ?? randomUUID();
    const contextWindow = input.contextWindow ?? existing?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
    const maxOutputTokens =
      input.maxOutputTokens ?? existing?.maxOutputTokens ?? defaultMaxOutput(contextWindow);
    if (maxOutputTokens >= contextWindow) {
      throw new Error('maxOutputTokens 必须小于 contextWindow');
    }

    const encryptedApiKey = input.apiKey ? encryptKey(input.apiKey) : existing?.encryptedApiKey;
    if (!encryptedApiKey) throw new Error('保存 Provider 需要 API Key');

    const encryptedHeaders =
      input.headers !== undefined ? encryptJson(input.headers) : existing?.encryptedHeaders;
    const encryptedExtraParams =
      input.extraParams !== undefined
        ? encryptJson(input.extraParams)
        : existing?.encryptedExtraParams;

    const provider: StoredProvider = {
      id,
      name: input.name,
      baseUrl: input.baseUrl,
      model: input.model,
      enabled: input.enabled ?? existing?.enabled ?? true,
      contextWindow,
      maxOutputTokens,
      encryptedApiKey,
      ...(encryptedHeaders === undefined ? {} : { encryptedHeaders }),
      ...(encryptedExtraParams === undefined ? {} : { encryptedExtraParams })
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
   * 读取完整配置并解密 API Key，仅供主进程使用。
   */
  async get(id: string): Promise<AgentProviderConfig | undefined> {
    const file = await this.readFile();
    const provider = file.providers.find((item) => item.id === id);
    if (!provider) return undefined;

    return {
      ...toPublic(provider),
      apiKey: decryptKey(provider.encryptedApiKey),
      ...(provider.encryptedHeaders
        ? { headers: decryptJson<Record<string, string>>(provider.encryptedHeaders) }
        : {}),
      ...(provider.encryptedExtraParams
        ? { extraParams: decryptJson<Record<string, unknown>>(provider.encryptedExtraParams) }
        : {})
    };
  }

  /**
   * 删除配置；不存在时视为成功。
   */
  async remove(id: string): Promise<void> {
    const file = await this.readFile();
    await this.writeFile({
      ...file,
      providers: file.providers.filter((item) => item.id !== id)
    });
  }
}

/**
 * 主进程共享的单例；IPC 与 AgentService 使用同一份配置。
 */
export const providerStore = new ProviderStore();
