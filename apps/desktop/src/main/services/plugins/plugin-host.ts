/**
 * 主进程插件宿主：扫描、校验、加载主进程入口并维护插件状态。
 */

import { readdir, readFile, realpath, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { watch, type FSWatcher } from 'node:fs';
import { Notification } from 'electron';
import type { DatabaseSync } from 'node:sqlite';
import type { NexusEvent } from '@shared/events';
import {
  pluginManifestSchema,
  type PluginManifest,
  type PluginPublic,
  type PluginSettingValue
} from '@shared/plugin';

const MAIN_ACTIVATION_TIMEOUT_MS = 10_000;

interface PluginRow {
  enabled: number;
  error: string | null;
  source: string;
}

/**
 * 限制主进程插件激活时长，避免插件阻塞宿主启动。
 */
const withTimeout = async <T>(promise: Promise<T>, message: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), MAIN_ACTIVATION_TIMEOUT_MS);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

interface PluginRecord {
  manifest: PluginManifest;
  directory: string;
  source: 'builtin' | 'user';
  enabled: boolean;
  error?: string | undefined;
  mainModule?: { deactivate?: () => void | Promise<void> } | undefined;
  disposables: Array<() => void>;
}

export interface PluginHostOptions {
  db: DatabaseSync;
  directory: string;
  builtinIds?: ReadonlySet<string>;
}

export interface MainPluginContext {
  pluginId: string;
  storage: {
    get: <T>(key: string) => T | undefined;
    set: <T>(key: string, value: T) => void;
    delete: (key: string) => void;
  };
  settings: Record<string, PluginSettingValue>;
  logger: {
    debug: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };
  notifications: {
    show: (message: string, level?: 'info' | 'warning' | 'error') => void;
  };
  events: {
    on: (event: string, handler: (payload: unknown) => void) => () => void;
  };
}

/**
 * 校验插件相对入口路径，禁止路径穿越。
 */
const resolveEntry = async (
  directory: string,
  entry: string | undefined
): Promise<string | undefined> => {
  if (!entry) return undefined;
  try {
    const root = await realpath(directory);
    const resolved = await realpath(join(directory, entry));
    if (resolved !== root && !resolved.startsWith(`${root}/`)) return undefined;
    if (!(await stat(resolved)).isFile()) return undefined;
    return resolved;
  } catch {
    return undefined;
  }
};

export class PluginHost {
  private readonly records = new Map<string, PluginRecord>();
  private readonly listeners = new Set<(plugins: PluginPublic[]) => void>();
  private readonly eventListeners = new Map<string, Set<(payload: unknown) => void>>();
  private watcher: FSWatcher | undefined;
  private reloadTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly options: PluginHostOptions) {}

  async scan(): Promise<PluginPublic[]> {
    for (const record of this.records.values()) await this.deactivate(record);
    this.records.clear();

    const entries = await readdir(this.options.directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const directory = join(this.options.directory, entry.name);
      try {
        const raw = JSON.parse(await readFile(join(directory, 'plugin.json'), 'utf8')) as unknown;
        const manifest = pluginManifestSchema.parse(raw);
        if (manifest.id !== entry.name) throw new Error('插件 id 与目录名不一致');
        const mainPath = await resolveEntry(directory, manifest.main);
        if (manifest.main && !mainPath) throw new Error('主进程入口不存在或越界');
        const row = this.options.db
          .prepare('SELECT enabled, error, source FROM plugins WHERE id = ?')
          .get(manifest.id) as PluginRow | undefined;
        const source =
          row?.source === 'builtin'
            ? 'builtin'
            : this.options.builtinIds?.has(manifest.id)
              ? 'builtin'
              : 'user';
        const enabled = row ? Boolean(row.enabled) : source === 'builtin';
        const record: PluginRecord = {
          manifest,
          directory,
          source,
          enabled,
          ...(row?.error ? { error: row.error } : {}),
          disposables: []
        };
        this.records.set(manifest.id, record);
        this.options.db
          .prepare(
            `INSERT INTO plugins (id, enabled, error, source, updated_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET source = excluded.source, updated_at = excluded.updated_at`
          )
          .run(manifest.id, enabled ? 1 : 0, null, source, Date.now());
        if (enabled && mainPath) await this.activateMain(record, mainPath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.records.set(entry.name, {
          manifest: {
            id: entry.name,
            name: entry.name,
            version: '0.0.0',
            engines: { nexus: '*' },
            activationEvents: [],
            permissions: [],
            contributes: {
              views: [],
              messageSlots: [],
              statusBar: [],
              commands: [],
              settings: [],
              skins: []
            }
          },
          directory,
          source: 'user',
          enabled: false,
          error: message,
          disposables: []
        });
        this.options.db
          .prepare(
            `INSERT INTO plugins (id, enabled, error, source, updated_at)
             VALUES (?, 0, ?, 'user', ?)
             ON CONFLICT(id) DO UPDATE SET enabled = 0, error = excluded.error, updated_at = excluded.updated_at`
          )
          .run(entry.name, message, Date.now());
      }
    }

    this.emitChanged();
    this.startWatcher();
    return this.list();
  }

  list(): PluginPublic[] {
    return [...this.records.values()].map((record) => ({
      id: record.manifest.id,
      name: record.manifest.name,
      version: record.manifest.version,
      ...(record.manifest.description ? { description: record.manifest.description } : {}),
      enabled: record.enabled,
      source: record.source,
      ...(record.error ? { error: record.error } : {}),
      permissions: record.manifest.permissions,
      activationEvents: record.manifest.activationEvents,
      contributes: record.manifest.contributes,
      ...(record.enabled && record.manifest.renderer
        ? { rendererUrl: `nexus-plugin://${record.manifest.id}/${record.manifest.renderer}` }
        : {}),
      hasMain: Boolean(record.manifest.main),
      mainLoaded: Boolean(record.mainModule)
    }));
  }

  async setEnabled(id: string, enabled: boolean): Promise<PluginPublic[]> {
    const record = this.records.get(id);
    if (!record) return this.list();
    if (!enabled) await this.deactivate(record);
    record.enabled = enabled;
    if (enabled) record.error = undefined;
    this.options.db
      .prepare('UPDATE plugins SET enabled = ?, error = ?, updated_at = ? WHERE id = ?')
      .run(enabled ? 1 : 0, enabled ? null : (record.error ?? null), Date.now(), id);
    if (enabled) {
      const mainPath = await resolveEntry(record.directory, record.manifest.main);
      if (mainPath) await this.activateMain(record, mainPath);
    }
    this.emitChanged();
    return this.list();
  }

  async reload(): Promise<PluginPublic[]> {
    return this.scan();
  }

  onChange(listener: (plugins: PluginPublic[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emitEvent(event: NexusEvent): void {
    for (const [name, handlers] of this.eventListeners) {
      if (name !== event.type) continue;
      for (const handler of handlers) {
        try {
          handler(event.payload);
        } catch (error) {
          console.error(`插件事件处理失败：${name}`, error);
        }
      }
    }
  }

  getRendererFile(pluginId: string, relativePath: string): Promise<string | undefined> {
    const record = this.records.get(pluginId);
    if (!record) return Promise.resolve(undefined);
    return resolveEntry(record.directory, relativePath);
  }

  getStorage(pluginId: string, key: string): unknown {
    const row = this.options.db
      .prepare('SELECT value FROM plugin_storage WHERE plugin_id = ? AND key = ?')
      .get(pluginId, key) as { value: string } | undefined;
    if (!row) return undefined;
    try {
      return JSON.parse(row.value);
    } catch {
      return undefined;
    }
  }

  setStorage(pluginId: string, key: string, value: unknown): void {
    this.options.db
      .prepare(
        `INSERT INTO plugin_storage (plugin_id, key, value) VALUES (?, ?, ?)
         ON CONFLICT(plugin_id, key) DO UPDATE SET value = excluded.value`
      )
      .run(pluginId, key, JSON.stringify(value));
  }

  deleteStorage(pluginId: string, key: string): void {
    this.options.db
      .prepare('DELETE FROM plugin_storage WHERE plugin_id = ? AND key = ?')
      .run(pluginId, key);
  }

  getSettings(pluginId: string): Record<string, PluginSettingValue> {
    const record = this.records.get(pluginId);
    const values: Record<string, PluginSettingValue> = {};
    for (const setting of record?.manifest.contributes.settings ?? []) {
      values[setting.key] = setting.default ?? null;
    }
    const stored = this.getStorage(pluginId, '__settings__');
    if (stored && typeof stored === 'object') Object.assign(values, stored);
    return values;
  }

  /**
   * 保存插件设置；只接受 manifest 声明的键，并按声明类型校验。
   */
  setSettings(
    pluginId: string,
    values: Record<string, PluginSettingValue>
  ): Record<string, PluginSettingValue> {
    const record = this.records.get(pluginId);
    if (!record) throw new Error('插件不存在');
    const definitions = new Map(
      record.manifest.contributes.settings.map((setting) => [setting.key, setting])
    );
    const next = this.getSettings(pluginId);
    for (const [key, value] of Object.entries(values)) {
      const definition = definitions.get(key);
      if (!definition) throw new Error(`未声明的设置项：${key}`);
      const valid =
        value === null ||
        (definition.type === 'string' && typeof value === 'string') ||
        (definition.type === 'number' && typeof value === 'number') ||
        (definition.type === 'boolean' && typeof value === 'boolean');
      if (!valid) throw new Error(`设置项类型不匹配：${key}`);
      next[key] = value;
    }
    this.setStorage(pluginId, '__settings__', next);
    return next;
  }

  /**
   * 卸载用户插件并清理其存储；内置插件由应用管理，不允许卸载。
   */
  async uninstall(id: string): Promise<PluginPublic[]> {
    const record = this.records.get(id);
    if (!record) return this.list();
    if (record.source === 'builtin') throw new Error('内置插件不能卸载，只能禁用');
    await this.deactivate(record);
    await rm(record.directory, { recursive: true, force: true });
    this.options.db.prepare('DELETE FROM plugins WHERE id = ?').run(id);
    this.options.db.prepare('DELETE FROM plugin_storage WHERE plugin_id = ?').run(id);
    this.records.delete(id);
    this.emitChanged();
    return this.list();
  }

  reportError(pluginId: string, error: string): void {
    const record = this.records.get(pluginId);
    const message = error.trim() || undefined;
    if (record) record.error = message;
    this.options.db
      .prepare('UPDATE plugins SET error = ?, updated_at = ? WHERE id = ?')
      .run(message ?? null, Date.now(), pluginId);
    if (message) this.emitChanged();
  }

  log(pluginId: string, level: string, message: string): void {
    const logger = level === 'error' ? console.error : console.warn;
    logger(`[plugin:${pluginId}] ${message}`);
  }

  async dispose(): Promise<void> {
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    this.watcher?.close();
    this.watcher = undefined;
    for (const record of this.records.values()) await this.deactivate(record);
    this.records.clear();
  }

  private async activateMain(record: PluginRecord, mainPath: string): Promise<void> {
    let module:
      | {
          activate?: (ctx: MainPluginContext) => void | Promise<void>;
          deactivate?: () => void | Promise<void>;
        }
      | undefined;
    try {
      // 清理插件目录下的模块缓存，保证 main 入口和它的子模块热重载生效
      for (const key of Object.keys(require.cache)) {
        if (key === mainPath || key.startsWith(`${record.directory}/`)) {
          delete require.cache[key];
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      module = require(mainPath) as {
        activate?: (ctx: MainPluginContext) => void | Promise<void>;
        deactivate?: () => void | Promise<void>;
      };
      if (typeof module.activate !== 'function') throw new Error('主进程入口缺少 activate');
      const ctx: MainPluginContext = {
        pluginId: record.manifest.id,
        storage: {
          get: <T>(key: string): T | undefined => {
            if (!record.manifest.permissions.includes('storage'))
              throw new Error('缺少 storage 权限');
            return this.getStorage(record.manifest.id, key) as T | undefined;
          },
          set: <T>(key: string, value: T): void => {
            if (!record.manifest.permissions.includes('storage'))
              throw new Error('缺少 storage 权限');
            this.setStorage(record.manifest.id, key, value);
          },
          delete: (key: string): void => {
            if (!record.manifest.permissions.includes('storage'))
              throw new Error('缺少 storage 权限');
            this.deleteStorage(record.manifest.id, key);
          }
        },
        settings: this.getSettings(record.manifest.id),
        logger: {
          debug: (message) => this.log(record.manifest.id, 'debug', message),
          info: (message) => this.log(record.manifest.id, 'info', message),
          warn: (message) => this.log(record.manifest.id, 'warn', message),
          error: (message) => this.log(record.manifest.id, 'error', message)
        },
        notifications: {
          show: (message) => {
            if (!record.manifest.permissions.includes('ui.notification')) {
              throw new Error('缺少 ui.notification 权限');
            }
            if (Notification?.isSupported?.())
              new Notification({ title: record.manifest.name, body: message }).show();
          }
        },
        events: {
          on: (event, handler) => {
            if (
              !record.manifest.permissions.includes(`events:${event}`) &&
              !record.manifest.permissions.includes('events:*')
            ) {
              throw new Error(`缺少事件权限：${event}`);
            }
            const handlers = this.eventListeners.get(event) ?? new Set();
            handlers.add(handler);
            this.eventListeners.set(event, handlers);
            const dispose = (): void => {
              handlers.delete(handler);
            };
            record.disposables.push(dispose);
            return dispose;
          }
        }
      };
      await withTimeout(Promise.resolve(module.activate(ctx)), '插件主进程激活超时');
      record.mainModule = module;
      record.error = undefined;
      this.options.db
        .prepare('UPDATE plugins SET error = NULL, updated_at = ? WHERE id = ?')
        .run(Date.now(), record.manifest.id);
    } catch (error) {
      try {
        await module?.deactivate?.();
      } catch {
        // 激活失败后的清理不能阻塞错误上报
      }
      for (const dispose of record.disposables.splice(0)) dispose();
      const message = error instanceof Error ? error.message : String(error);
      record.error = message;
      record.enabled = false;
      this.options.db
        .prepare('UPDATE plugins SET enabled = 0, error = ?, updated_at = ? WHERE id = ?')
        .run(message, Date.now(), record.manifest.id);
    }
  }

  private async deactivate(record: PluginRecord): Promise<void> {
    try {
      await record.mainModule?.deactivate?.();
    } catch {
      // 插件停用异常不能阻塞其他插件
    }
    record.mainModule = undefined;
    for (const dispose of record.disposables.splice(0)) dispose();
  }

  private emitChanged(): void {
    const plugins = this.list();
    for (const listener of this.listeners) listener(plugins);
  }

  private startWatcher(): void {
    if (this.watcher) return;
    try {
      this.watcher = watch(this.options.directory, { recursive: true }, () => {
        if (this.reloadTimer) clearTimeout(this.reloadTimer);
        this.reloadTimer = setTimeout(() => {
          this.scan().catch((error: unknown) => {
            console.error('插件热重载失败', error);
          });
        }, 300);
      });
    } catch {
      // 文件监听不可用时保留手动刷新
    }
  }
}
