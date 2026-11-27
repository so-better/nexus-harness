/**
 * 渲染层插件运行时：加载插件 renderer 入口并注入受限 ctx。
 */

import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { NexusEvent } from '@shared/events';
import type {
  PluginManifest,
  PluginPublic,
  PluginSettingValue,
  PluginSkinSelection,
  PluginSlotLocation,
  PluginStartupSelection,
  PluginWorkspaceEntry,
  PluginNetRequestInit,
  PluginNetResponse
} from '@shared/plugin';
import type { UsageStats, UsageStatsInput } from '@shared/usage';
import {
  deletePluginStorage,
  getPluginSettings,
  getPluginStorage,
  getSelectedSkin,
  getSelectedStartup,
  getUsageStats as getPluginUsageStats,
  listPlugins,
  logPlugin,
  notifyPlugin,
  importPluginDirectory,
  reloadPlugins,
  reportPluginError,
  readPluginWorkspace,
  listPluginWorkspace,
  setPluginEnabled,
  setPluginSettings,
  setPluginStorage,
  setSelectedSkin,
  setSelectedStartup,
  subscribeSkinChanges,
  subscribeStartupChanges,
  subscribePluginChanges,
  subscribePluginEvents,
  fetchPluginNetwork,
  getPluginSecret,
  setPluginSecret,
  deletePluginSecret,
  uninstallPlugin
} from './api/plugin.api';
import { slotRegistry, type SlotContext } from './slot-registry';
import { requestComposerInsert } from '@/composables/composer-bus';
import { showAppMessage } from '@/app/app-message';

export interface PluginSkin {
  pluginId: string;
  pluginName: string;
  id: string;
  title: string;
}

export type PluginSkinMount = (element: HTMLElement, ctx: PluginContext) => () => void;
export type PluginStartupMount = (
  element: HTMLElement,
  ctx: PluginContext,
  finish: () => void
) => () => void;

export interface ActivePluginSkin extends PluginSkin {
  mount: PluginSkinMount;
  context: PluginContext;
}

export interface PluginStartup {
  pluginId: string;
  pluginName: string;
  id: string;
  title: string;
  countdownMs: number;
}

export interface ActivePluginStartup extends PluginStartup {
  mount: PluginStartupMount;
  context: PluginContext;
}

export interface PluginStatusItem {
  id: string;
  text: string;
  align: 'left' | 'right';
  title?: string;
  icon?: string;
  onClick?: () => void;
}

export interface PluginCommand {
  id: string;
  title: string;
  shortcut?: string;
  handler: () => void | Promise<void>;
}

export interface PluginCommandDescriptor {
  pluginId: string;
  id: string;
  title: string;
  shortcut?: string;
}

export interface PluginView {
  pluginId: string;
  id: string;
  title: string;
  mount: (element: HTMLElement, ctx: PluginContext) => () => void;
  context: PluginContext;
  /** 是否挂载在 Shadow DOM（默认 true；false 时挂普通 DOM，便于使用 UI 库全局样式） */
  shadow?: boolean;
}

export interface PluginQuickPickItem {
  id: string;
  title: string;
  description?: string;
  run: () => void | Promise<void>;
}

export type PluginQuickPickProvider = () => PluginQuickPickItem[] | Promise<PluginQuickPickItem[]>;

export interface PluginContext {
  pluginId: string;
  commands: {
    register: (id: string, handler: () => void | Promise<void>) => () => void;
    registerProvider: (id: string, provider: PluginQuickPickProvider) => () => void;
  };
  views: {
    register: (id: string, mount: PluginView['mount']) => () => void;
    open: (id: string) => Promise<void>;
  };
  slots: {
    register: (
      id: string,
      mount: (element: HTMLElement, ctx: SlotContext) => () => void
    ) => () => void;
  };
  skins: {
    register: (id: string, mount: PluginSkinMount) => () => void;
  };
  startup: {
    register: (id: string, mount: PluginStartupMount) => () => void;
  };
  statusBar: {
    add: (item: Omit<PluginStatusItem, 'align'> & { align?: 'left' | 'right' }) => () => void;
  };
  events: {
    on: (
      event: string,
      handler: (
        payload: unknown,
        meta: { type: string; sessionId: string; runId?: string; ts: number }
      ) => void
    ) => () => void;
  };
  storage: {
    get: <T>(key: string) => Promise<T | undefined>;
    set: <T>(key: string, value: T) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
  settings: Record<string, PluginSettingValue>;
  usage: {
    getStats: (input?: UsageStatsInput) => Promise<UsageStats>;
  };
  logger: {
    debug: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };
  notifications: {
    show: (message: string, level?: 'info' | 'warning' | 'error') => void;
    message: (message: string, level?: 'info' | 'warning' | 'error') => void;
  };
  workspace: {
    readFile: (path: string) => Promise<string>;
    list: (dir?: string) => Promise<PluginWorkspaceEntry[]>;
  };
  net: {
    fetch: (url: string, init?: PluginNetRequestInit) => Promise<PluginNetResponse>;
  };
  jobs: {
    every: (intervalMs: number, handler: () => void | Promise<void>) => () => void;
  };
  composer: {
    insert: (text: string) => void;
  };
  secrets: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
}

interface ActivePlugin {
  module: { deactivate?: () => void | Promise<void> };
  disposables: Array<() => void>;
}

const hasPermission = (plugin: PluginPublic, permission: string): boolean =>
  plugin.permissions.includes(permission);

const ACTIVATION_TIMEOUT_MS = 10_000;

/**
 * 限制插件激活时长，避免单个插件阻塞整个运行时。
 */
const withTimeout = async <T>(promise: Promise<T>, message: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ACTIVATION_TIMEOUT_MS);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const usePluginRuntimeStore = defineStore('plugin-runtime', () => {
  const plugins = ref<PluginPublic[]>([]);
  const statusItems = ref<PluginStatusItem[]>([]);
  const commands = ref(new Map<string, PluginCommand>());
  /** 插件快速选择提供者：pluginId → providerId → provider */
  const quickPickProviders = ref(new Map<string, Map<string, PluginQuickPickProvider>>());
  const views = ref(new Map<string, PluginView>());
  const openedView = ref<PluginView | null>(null);
  /** 主区（右侧整页）插件视图：由导航栏选择触发，与弹窗式 openedView 区分 */
  const mainView = ref<PluginView | null>(null);
  /** 插件侧栏导航入口：来自启用且具备 ui.panel 的插件的 navigation 贡献 */
  const navigationEntries = computed(() =>
    plugins.value
      .filter((plugin) => plugin.enabled && plugin.permissions.includes('ui.panel'))
      .flatMap((plugin) =>
        plugin.contributes.navigation
          .filter((nav) => plugin.contributes.views.some((view) => view.id === nav.viewId))
          .map((nav) => ({
            pluginId: plugin.id,
            id: nav.id,
            title: nav.title,
            ...(nav.icon ? { icon: nav.icon } : {}),
            viewId: nav.viewId
          }))
      )
  );
  const version = ref(0);
  const loading = ref(false);
  const error = ref<string>();
  const selectedSkin = ref<PluginSkinSelection | null>(null);
  const selectedStartup = ref<PluginStartupSelection | null>(null);
  const skinMounts = ref(new Map<string, { mount: PluginSkinMount; context: PluginContext }>());
  const startupMounts = ref(
    new Map<string, { mount: PluginStartupMount; context: PluginContext }>()
  );
  const activeSessionId = ref<string>();
  const active = new Map<string, ActivePlugin>();
  const eventHandlers = new Map<
    string,
    Set<
      (
        payload: unknown,
        meta: { type: string; sessionId: string; runId?: string; ts: number }
      ) => void
    >
  >();
  const activating = new Set<string>();
  const activationWaiters = new Map<string, Array<() => void>>();
  let initialized = false;
  let initPromise: Promise<void> | undefined;
  let unsubscribeChanges: (() => void) | undefined;
  let unsubscribeSkinChanges: (() => void) | undefined;
  let unsubscribeStartupChanges: (() => void) | undefined;
  let unsubscribeEvents: (() => void) | undefined;
  let activationNonce = 0;

  const skins = computed<PluginSkin[]>(() =>
    plugins.value.flatMap((plugin) =>
      plugin.enabled && hasPermission(plugin, 'ui.skin')
        ? plugin.contributes.skins.map((skin) => ({
            pluginId: plugin.id,
            pluginName: plugin.name,
            id: skin.id,
            title: skin.title
          }))
        : []
    )
  );
  const activeSkin = computed(
    () =>
      skins.value.find(
        (skin) =>
          skin.pluginId === selectedSkin.value?.pluginId && skin.id === selectedSkin.value?.skinId
      ) ?? null
  );
  const activeSkinMount = computed<ActivePluginSkin | null>(() => {
    const skin = activeSkin.value;
    if (!skin) return null;
    const implementation = skinMounts.value.get(`${skin.pluginId}:${skin.id}`);
    return implementation ? { ...skin, ...implementation } : null;
  });
  const availableCommands = computed<PluginCommandDescriptor[]>(() =>
    plugins.value.flatMap((plugin) =>
      plugin.enabled
        ? plugin.contributes.commands.map((command) => ({
            pluginId: plugin.id,
            id: command.id,
            title: command.title,
            ...(command.shortcut ? { shortcut: command.shortcut } : {})
          }))
        : []
    )
  );
  const startupAnimations = computed<PluginStartup[]>(() =>
    plugins.value.flatMap((plugin) =>
      plugin.enabled && plugin.rendererUrl && hasPermission(plugin, 'ui.startup')
        ? plugin.contributes.startup.map((startup) => ({
            pluginId: plugin.id,
            pluginName: plugin.name,
            id: startup.id,
            title: startup.title,
            countdownMs: startup.countdownMs
          }))
        : []
    )
  );
  const activeStartup = computed(
    () =>
      startupAnimations.value.find(
        (startup) =>
          startup.pluginId === selectedStartup.value?.pluginId &&
          startup.id === selectedStartup.value?.startupId
      ) ?? null
  );
  const activeStartupMount = computed<ActivePluginStartup | null>(() => {
    const startup = activeStartup.value;
    if (!startup) return null;
    const implementation = startupMounts.value.get(`${startup.pluginId}:${startup.id}`);
    return implementation ? { ...startup, ...implementation } : null;
  });

  const bump = (): void => {
    version.value += 1;
  };

  const notifyError = (pluginId: string, reason: unknown): void => {
    const message = reason instanceof Error ? reason.message : String(reason);
    error.value = `${pluginId}: ${message}`;
    reportPluginError(pluginId, message).catch(() => undefined);
  };

  /**
   * 报告贡献点挂载失败；保留插件启用状态，交给扩展页展示错误。
   */
  const reportPluginFailure = (pluginId: string, reason: unknown): void => {
    notifyError(pluginId, reason);
  };

  const activatePlugin = async (plugin: PluginPublic): Promise<void> => {
    if (!plugin.enabled || !plugin.rendererUrl || active.has(plugin.id)) return;
    if (activating.has(plugin.id)) {
      // 同一插件的并发激活必须等待首个激活完成，否则调用方会误判挂载尚未注册
      await new Promise<void>((resolve) => {
        const waiters = activationWaiters.get(plugin.id) ?? [];
        waiters.push(resolve);
        activationWaiters.set(plugin.id, waiters);
      });
      return;
    }
    activating.add(plugin.id);
    let disposable: ActivePlugin | undefined;
    try {
      const url = plugin.rendererUrl.startsWith('nexus-plugin://')
        ? `${plugin.rendererUrl}?v=${plugin.version}-${activationNonce}`
        : plugin.rendererUrl;
      const module = (await import(/* @vite-ignore */ url)) as {
        activate?: (ctx: PluginContext) => void | Promise<void>;
        deactivate?: () => void | Promise<void>;
      };
      if (typeof module.activate !== 'function') throw new Error('renderer 入口缺少 activate');
      const currentDisposable: ActivePlugin = { module, disposables: [] };
      disposable = currentDisposable;
      const settings = await getPluginSettings(plugin.id);
      const manifest = plugin as unknown as PluginManifest;
      let activeJobCount = 0;
      const ctx: PluginContext = {
        pluginId: plugin.id,
        commands: {
          register: (id, handler) => {
            if (!hasPermission(plugin, 'ui.command')) throw new Error('缺少 ui.command 权限');
            if (!manifest.contributes.commands.some((item) => item.id === id)) {
              throw new Error(`未声明的命令：${id}`);
            }
            const contribution = manifest.contributes.commands.find((item) => item.id === id);
            const command = {
              id,
              title: contribution?.title ?? id,
              ...(contribution?.shortcut ? { shortcut: contribution.shortcut } : {}),
              handler
            };
            const next = new Map(commands.value);
            next.set(id, command);
            commands.value = next;
            bump();
            const dispose = (): void => {
              const next = new Map(commands.value);
              next.delete(id);
              commands.value = next;
              bump();
            };
            currentDisposable.disposables.push(dispose);
            return dispose;
          },
          registerProvider: (id, provider) => {
            if (!hasPermission(plugin, 'ui.command')) throw new Error('缺少 ui.command 权限');
            const providers = new Map(quickPickProviders.value.get(plugin.id) ?? []);
            providers.set(id, provider);
            const next = new Map(quickPickProviders.value);
            next.set(plugin.id, providers);
            quickPickProviders.value = next;
            bump();
            const dispose = (): void => {
              const current = new Map(quickPickProviders.value);
              const list = new Map(current.get(plugin.id) ?? []);
              list.delete(id);
              if (list.size) current.set(plugin.id, list);
              else current.delete(plugin.id);
              quickPickProviders.value = current;
              bump();
            };
            currentDisposable.disposables.push(dispose);
            return dispose;
          }
        },
        views: {
          open: async (id) => {
            if (!hasPermission(plugin, 'ui.panel')) throw new Error('缺少 ui.panel 权限');
            const view = views.value.get(`${plugin.id}:${id}`);
            if (!view || view.pluginId !== plugin.id) throw new Error(`未声明的视图：${id}`);
            openedView.value = view;
          },
          register: (id, mount) => {
            if (!hasPermission(plugin, 'ui.panel')) throw new Error('缺少 ui.panel 权限');
            const contribution = manifest.contributes.views.find((item) => item.id === id);
            if (!contribution) throw new Error(`未声明的视图：${id}`);
            const key = `${plugin.id}:${id}`;
            views.value.set(key, {
              pluginId: plugin.id,
              id,
              title: contribution.title,
              mount,
              context: ctx,
              shadow: plugin.shadowDom !== false
            });
            bump();
            const dispose = (): void => {
              views.value.delete(key);
              if (openedView.value?.pluginId === plugin.id && openedView.value.id === id) {
                openedView.value = null;
              }
              if (mainView.value?.pluginId === plugin.id && mainView.value.id === id) {
                mainView.value = null;
              }
              bump();
            };
            currentDisposable.disposables.push(dispose);
            return dispose;
          }
        },
        slots: {
          register: (id, mount) => {
            if (!hasPermission(plugin, 'ui.slot')) throw new Error('缺少 ui.slot 权限');
            const contribution = manifest.contributes.messageSlots.find((item) => item.id === id);
            if (!contribution) throw new Error(`未声明的插槽：${id}`);
            const dispose = slotRegistry.register({
              pluginId: plugin.id,
              id,
              location: contribution.location as PluginSlotLocation,
              mount,
              shadow: plugin.shadowDom !== false
            });
            bump();
            currentDisposable.disposables.push(dispose);
            return dispose;
          }
        },
        skins: {
          register: (id, mount) => {
            if (!hasPermission(plugin, 'ui.skin')) throw new Error('缺少 ui.skin 权限');
            if (!manifest.contributes.skins.some((item) => item.id === id)) {
              throw new Error(`未声明的皮肤：${id}`);
            }
            const key = `${plugin.id}:${id}`;
            const next = new Map(skinMounts.value);
            next.set(key, { mount, context: ctx });
            skinMounts.value = next;
            bump();
            const dispose = (): void => {
              const current = new Map(skinMounts.value);
              current.delete(key);
              skinMounts.value = current;
              bump();
            };
            currentDisposable.disposables.push(dispose);
            return dispose;
          }
        },
        startup: {
          register: (id, mount) => {
            if (!hasPermission(plugin, 'ui.startup')) throw new Error('缺少 ui.startup 权限');
            if (!manifest.contributes.startup.some((item) => item.id === id)) {
              throw new Error(`未声明的启动动画：${id}`);
            }
            const key = `${plugin.id}:${id}`;
            const next = new Map(startupMounts.value);
            next.set(key, { mount, context: ctx });
            startupMounts.value = next;
            bump();
            const dispose = (): void => {
              const current = new Map(startupMounts.value);
              current.delete(key);
              startupMounts.value = current;
              bump();
            };
            currentDisposable.disposables.push(dispose);
            return dispose;
          }
        },
        statusBar: {
          add: (item) => {
            if (!hasPermission(plugin, 'ui.statusbar')) throw new Error('缺少 ui.statusbar 权限');
            if (!manifest.contributes.statusBar.some((entry) => entry.id === item.id)) {
              throw new Error(`未声明的状态栏项：${item.id}`);
            }
            const entry: PluginStatusItem = { ...item, align: item.align ?? 'right' };
            statusItems.value = [
              ...statusItems.value.filter((existing) => existing.id !== item.id),
              entry
            ];
            const dispose = (): void => {
              statusItems.value = statusItems.value.filter((existing) => existing.id !== item.id);
            };
            currentDisposable.disposables.push(dispose);
            return dispose;
          }
        },
        events: {
          on: (event, handler) => {
            if (event === 'message.delta') throw new Error('高频事件 message.delta 不开放');
            if (!hasPermission(plugin, `events:${event}`) && !hasPermission(plugin, 'events:*')) {
              throw new Error(`缺少事件权限：${event}`);
            }
            const handlers = eventHandlers.get(event) ?? new Set();
            handlers.add(handler);
            eventHandlers.set(event, handlers);
            const dispose = (): void => {
              handlers.delete(handler);
            };
            currentDisposable.disposables.push(dispose);
            return dispose;
          }
        },
        storage: {
          get: async <T>(key: string): Promise<T | undefined> => {
            if (!hasPermission(plugin, 'storage')) throw new Error('缺少 storage 权限');
            return (await getPluginStorage(plugin.id, key)) as T | undefined;
          },
          set: async <T>(key: string, value: T): Promise<void> => {
            if (!hasPermission(plugin, 'storage')) throw new Error('缺少 storage 权限');
            await setPluginStorage(plugin.id, key, value);
          },
          delete: async (key: string): Promise<void> => {
            if (!hasPermission(plugin, 'storage')) throw new Error('缺少 storage 权限');
            await deletePluginStorage(plugin.id, key);
          }
        },
        settings,
        usage: {
          getStats: async (input = {}) => {
            if (!hasPermission(plugin, 'usage:read')) throw new Error('缺少 usage:read 权限');
            return getPluginUsageStats(input);
          }
        },
        logger: {
          debug: (message) => logPlugin(plugin.id, 'debug', message).catch(() => undefined),
          info: (message) => logPlugin(plugin.id, 'info', message).catch(() => undefined),
          warn: (message) => logPlugin(plugin.id, 'warn', message).catch(() => undefined),
          error: (message) => logPlugin(plugin.id, 'error', message).catch(() => undefined)
        },
        notifications: {
          show: (text, level = 'info') => {
            if (!hasPermission(plugin, 'ui.notification')) {
              throw new Error('缺少 ui.notification 权限');
            }
            notifyPlugin(plugin.id, text, level).catch(() => undefined);
          },
          message: (text, level = 'info') => {
            if (!hasPermission(plugin, 'ui.notification')) {
              throw new Error('缺少 ui.notification 权限');
            }
            showAppMessage(text, level);
          }
        },
        secrets: {
          get: async (key) => {
            if (!hasPermission(plugin, 'secrets')) throw new Error('缺少 secrets 权限');
            return getPluginSecret(plugin.id, key);
          },
          set: async (key, value) => {
            if (!hasPermission(plugin, 'secrets')) throw new Error('缺少 secrets 权限');
            await setPluginSecret(plugin.id, key, value);
          },
          delete: async (key) => {
            if (!hasPermission(plugin, 'secrets')) throw new Error('缺少 secrets 权限');
            await deletePluginSecret(plugin.id, key);
          }
        },
        jobs: {
          every: (intervalMs, handler) => {
            if (!hasPermission(plugin, 'background')) throw new Error('缺少 background 权限');
            if (activeJobCount >= 20) throw new Error('后台任务数量已达上限（20）');
            activeJobCount += 1;
            const interval = Math.max(5_000, Math.floor(intervalMs));
            const timer = setInterval(() => {
              Promise.resolve()
                .then(handler)
                .catch((error: unknown) => {
                  console.error(`插件后台任务失败：${plugin.id}`, error);
                });
            }, interval);
            let cleared = false;
            const dispose = (): void => {
              if (cleared) return;
              cleared = true;
              clearInterval(timer);
              activeJobCount = Math.max(0, activeJobCount - 1);
            };
            currentDisposable.disposables.push(dispose);
            return dispose;
          }
        },
        composer: {
          insert: (text) => {
            if (!hasPermission(plugin, 'ui.composer')) throw new Error('缺少 ui.composer 权限');
            requestComposerInsert(text);
          }
        },
        net: {
          fetch: async (url, init) => {
            if (!hasPermission(plugin, 'network')) throw new Error('缺少 network 权限');
            return fetchPluginNetwork(plugin.id, url, init);
          }
        },
        workspace: {
          readFile: async (path) => {
            if (!hasPermission(plugin, 'workspace:read'))
              throw new Error('缺少 workspace:read 权限');
            if (!activeSessionId.value) throw new Error('当前没有活动会话');
            return readPluginWorkspace(plugin.id, activeSessionId.value, path);
          },
          list: async (dir) => {
            if (!hasPermission(plugin, 'workspace:read'))
              throw new Error('缺少 workspace:read 权限');
            if (!activeSessionId.value) throw new Error('当前没有活动会话');
            return listPluginWorkspace(
              plugin.id,
              activeSessionId.value,
              dir === undefined ? undefined : dir
            );
          }
        }
      };
      await withTimeout(Promise.resolve(module.activate(ctx)), '插件激活超时');
      active.set(plugin.id, currentDisposable);
      reportPluginError(plugin.id, '').catch(() => undefined);
      plugins.value = plugins.value.map((item) => {
        if (item.id !== plugin.id || !item.error) return item;
        const next = { ...item };
        delete next.error;
        return next;
      });
      bump();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (disposable) {
        for (const dispose of disposable.disposables.splice(0)) dispose();
      }
      error.value = `${plugin.id}: ${message}`;
      try {
        await setPluginEnabled(plugin.id, false);
      } catch {
        // 自动禁用失败时保留运行时错误，用户仍可在扩展页手动处理
      }
      plugins.value = plugins.value.map((item) =>
        item.id === plugin.id ? { ...item, enabled: false, error: message } : item
      );
      reportPluginError(plugin.id, message).catch(() => undefined);
    } finally {
      activating.delete(plugin.id);
      const waiters = activationWaiters.get(plugin.id);
      activationWaiters.delete(plugin.id);
      for (const resolve of waiters ?? []) resolve();
    }
  };

  const deactivateAll = async (): Promise<void> => {
    activationNonce += 1;
    for (const item of active.values()) {
      try {
        await item.module.deactivate?.();
      } catch {
        // 忽略单个插件的停用异常
      }
      for (const dispose of item.disposables) dispose();
    }
    active.clear();
    eventHandlers.clear();
    statusItems.value = [];
    commands.value = new Map();
    views.value.clear();
    openedView.value = null;
    mainView.value = null;
    slotRegistry.clear();
    skinMounts.value = new Map();
    startupMounts.value = new Map();
    bump();
  };

  const applyPlugins = async (next: PluginPublic[]): Promise<void> => {
    await deactivateAll();
    plugins.value = next;
    if (
      selectedSkin.value &&
      !skins.value.some(
        (skin) =>
          skin.pluginId === selectedSkin.value?.pluginId && skin.id === selectedSkin.value?.skinId
      )
    ) {
      selectedSkin.value = null;
      setSelectedSkin(null).catch(() => undefined);
    }
    if (
      selectedStartup.value &&
      !startupAnimations.value.some(
        (startup) =>
          startup.pluginId === selectedStartup.value?.pluginId &&
          startup.id === selectedStartup.value?.startupId
      )
    ) {
      selectedStartup.value = null;
      setSelectedStartup(null).catch(() => undefined);
    }
    bump();
  };

  const activateStatusbar = async (): Promise<void> => {
    for (const plugin of plugins.value) {
      if (plugin.contributes.statusBar.length) await activatePlugin(plugin);
    }
  };

  const activateForExtensions = async (): Promise<void> => {
    for (const plugin of plugins.value) {
      if (plugin.contributes.commands.length || plugin.contributes.views.length) {
        await activatePlugin(plugin);
      }
    }
  };

  const activateForSkins = async (): Promise<void> => {
    for (const plugin of plugins.value) {
      if (plugin.contributes.skins.length) await activatePlugin(plugin);
    }
  };

  const activateForStartup = async (): Promise<void> => {
    const selected = selectedStartup.value;
    if (!selected) return;
    const plugin = plugins.value.find(
      (item) =>
        item.enabled &&
        item.id === selected.pluginId &&
        item.contributes.startup.some((startup) => startup.id === selected.startupId)
    );
    if (plugin) await activatePlugin(plugin);
  };

  const activateForView = async (viewId: string): Promise<void> => {
    for (const plugin of plugins.value) {
      if (
        plugin.activationEvents.includes(`onView:${viewId}`) ||
        plugin.contributes.views.some((item) => item.id === viewId)
      ) {
        await activatePlugin(plugin);
      }
    }
  };

  const activateForCommand = async (commandId: string): Promise<void> => {
    for (const plugin of plugins.value) {
      if (
        plugin.activationEvents.includes(`onCommand:${commandId}`) ||
        plugin.contributes.commands.some((item) => item.id === commandId)
      ) {
        await activatePlugin(plugin);
      }
    }
  };

  const activateForSlot = async (location: PluginSlotLocation): Promise<void> => {
    for (const plugin of plugins.value) {
      if (plugin.contributes.messageSlots.some((item) => item.location === location)) {
        await activatePlugin(plugin);
      }
    }
  };

  const dispatchEvent = async (event: NexusEvent): Promise<void> => {
    for (const plugin of plugins.value) {
      if (plugin.activationEvents.includes(`onEvent:${event.type}`)) await activatePlugin(plugin);
    }
    for (const handler of eventHandlers.get(event.type) ?? []) {
      try {
        handler(event.payload, {
          type: event.type,
          sessionId: event.sessionId,
          ts: event.ts,
          ...(event.runId ? { runId: event.runId } : {}),
          ...(event.parentToolCallId ? { parentToolCallId: event.parentToolCallId } : {})
        });
      } catch (reason) {
        error.value = reason instanceof Error ? reason.message : String(reason);
      }
    }
  };

  /**
   * 应用来自设置页或 AI 工具的外部皮肤选择，触发背景层重新挂载。
   */
  const applyExternalSkin = async (selection: PluginSkinSelection | null): Promise<void> => {
    if (
      selection?.pluginId === selectedSkin.value?.pluginId &&
      selection?.skinId === selectedSkin.value?.skinId
    ) {
      return;
    }
    const previous = selectedSkin.value;
    selectedSkin.value = selection;
    try {
      if (selection) {
        await activateForSkins();
        if (!activeSkinMount.value) throw new Error('皮肤插件未提供可渲染的实现');
      }
      bump();
    } catch (reason) {
      selectedSkin.value = previous;
      bump();
      notifyError('plugin-runtime', reason);
      // 外部选择已落盘，挂载失败时把持久化选择恢复，避免下次启动继续失败
      if (selection) await setSelectedSkin(previous).catch(() => undefined);
    }
  };

  const applyExternalStartup = async (selection: PluginStartupSelection | null): Promise<void> => {
    if (
      selection?.pluginId === selectedStartup.value?.pluginId &&
      selection?.startupId === selectedStartup.value?.startupId
    ) {
      return;
    }
    const previous = selectedStartup.value;
    if (
      selection &&
      !startupAnimations.value.some(
        (startup) => startup.pluginId === selection.pluginId && startup.id === selection.startupId
      )
    ) {
      notifyError('plugin-runtime', '启动动画不存在或未启用');
      await setSelectedStartup(previous).catch(() => undefined);
      return;
    }
    selectedStartup.value = selection;
    try {
      if (selection) {
        await activateForStartup();
        if (!activeStartupMount.value) throw new Error('启动动画插件未提供可渲染的实现');
      }
      bump();
    } catch (reason) {
      selectedStartup.value = previous;
      bump();
      notifyError('plugin-runtime', reason);
      await setSelectedStartup(previous).catch(() => undefined);
    }
  };

  const init = (): Promise<void> => {
    if (initialized) return Promise.resolve();
    if (initPromise) return initPromise;
    loading.value = true;
    initPromise = (async () => {
      try {
        plugins.value = await listPlugins();
        const savedSkin = await getSelectedSkin();
        const exists =
          savedSkin &&
          skins.value.some(
            (skin) => skin.pluginId === savedSkin.pluginId && skin.id === savedSkin.skinId
          );
        selectedSkin.value = exists ? savedSkin : null;
        if (savedSkin && !exists) await setSelectedSkin(null).catch(() => undefined);
        const savedStartup = await getSelectedStartup();
        const startupExists =
          savedStartup &&
          startupAnimations.value.some(
            (startup) =>
              startup.pluginId === savedStartup.pluginId && startup.id === savedStartup.startupId
          );
        selectedStartup.value = startupExists ? savedStartup : null;
        if (savedStartup && !startupExists) await setSelectedStartup(null).catch(() => undefined);
        bump();
        unsubscribeChanges = subscribePluginChanges((next) => {
          applyPlugins(next).catch((reason: unknown) => notifyError('plugin-runtime', reason));
        });
        unsubscribeSkinChanges = subscribeSkinChanges((payload) => {
          applyExternalSkin(payload.selection).catch((reason: unknown) =>
            notifyError('plugin-runtime', reason)
          );
        });
        unsubscribeStartupChanges = subscribeStartupChanges((payload) => {
          applyExternalStartup(payload.selection).catch((reason: unknown) =>
            notifyError('plugin-runtime', reason)
          );
        });
        unsubscribeEvents = subscribePluginEvents((event) => {
          if (event.type === 'message.delta') return;
          dispatchEvent(event).catch((reason: unknown) => notifyError('plugin-runtime', reason));
        });
      } catch (reason) {
        error.value = reason instanceof Error ? reason.message : String(reason);
      } finally {
        initialized = true;
        loading.value = false;
        initPromise = undefined;
      }
    })();
    return initPromise;
  };

  const selectSkin = async (selection: PluginSkinSelection | null): Promise<void> => {
    const previous = selectedSkin.value;
    selectedSkin.value = selection;
    try {
      await setSelectedSkin(selection);
      if (selection) {
        await activateForSkins();
        if (!activeSkinMount.value) throw new Error('皮肤插件未提供可渲染的实现');
      }
    } catch (reason) {
      selectedSkin.value = previous;
      bump();
      notifyError('plugin-runtime', reason);
      await setSelectedSkin(previous).catch(() => undefined);
    }
  };

  const selectStartup = async (selection: PluginStartupSelection | null): Promise<void> => {
    if (
      selection &&
      !startupAnimations.value.some(
        (startup) => startup.pluginId === selection.pluginId && startup.id === selection.startupId
      )
    ) {
      notifyError('plugin-runtime', '启动动画不存在或未启用');
      return;
    }
    const previous = selectedStartup.value;
    selectedStartup.value = selection;
    try {
      await setSelectedStartup(selection);
      if (selection) {
        await activateForStartup();
        if (!activeStartupMount.value) throw new Error('启动动画插件未提供可渲染的实现');
      }
    } catch (reason) {
      selectedStartup.value = previous;
      bump();
      notifyError('plugin-runtime', reason);
      await setSelectedStartup(previous).catch(() => undefined);
    }
  };

  const loadSettings = async (id: string): Promise<Record<string, PluginSettingValue>> =>
    getPluginSettings(id);

  const saveSettings = async (
    id: string,
    values: Record<string, PluginSettingValue>
  ): Promise<void> => {
    await setPluginSettings(id, values);
    await applyPlugins(await reloadPlugins());
  };

  const uninstall = async (id: string): Promise<void> => {
    await applyPlugins(await uninstallPlugin(id));
  };

  const setActiveSession = (sessionId: string | undefined): void => {
    activeSessionId.value = sessionId;
  };

  const setEnabled = async (id: string, enabled: boolean): Promise<void> => {
    try {
      await applyPlugins(await setPluginEnabled(id, enabled));
      if (enabled) {
        await activateStatusbar();
        await activateForExtensions();
        if (selectedSkin.value) await activateForSkins();
      }
    } catch (reason) {
      notifyError(id, reason);
    }
  };

  const importFromDirectory = async (): Promise<boolean> => {
    error.value = undefined;
    try {
      const next = await importPluginDirectory();
      if (!next) return false;
      await applyPlugins(next);
      return true;
    } catch (reason) {
      const messageText = reason instanceof Error ? reason.message : String(reason);
      error.value = messageText;
      reportPluginError('plugin-runtime', messageText).catch(() => undefined);
      return false;
    }
  };

  const reload = async (): Promise<void> => {
    error.value = undefined;
    try {
      await applyPlugins(await reloadPlugins());
      await activateForExtensions();
      if (selectedSkin.value) await activateForSkins();
    } catch (reason) {
      notifyError('plugin-runtime', reason);
    }
  };

  /**
   * 收集已激活插件注册的快速选择项，供命令面板打开时合并。
   */
  const collectQuickPicks = async (): Promise<
    Array<{
      id: string;
      title: string;
      description?: string;
      source: string;
      pluginId: string;
      run: () => void | Promise<void>;
    }>
  > => {
    const results: Array<{
      id: string;
      title: string;
      description?: string;
      source: string;
      pluginId: string;
      run: () => void | Promise<void>;
    }> = [];
    for (const [pluginId, providers] of quickPickProviders.value) {
      const plugin = plugins.value.find((item) => item.id === pluginId);
      const source = plugin?.name ?? pluginId;
      for (const [providerId, provider] of providers) {
        try {
          const items = await provider();
          for (const item of items) {
            results.push({
              id: `pluginpick:${pluginId}:${providerId}:${item.id}`,
              title: item.title,
              ...(item.description ? { description: item.description } : {}),
              source,
              pluginId,
              run: item.run
            });
          }
        } catch (error) {
          console.error(`插件快速选择失败：${pluginId}/${providerId}`, error);
        }
      }
    }
    return results;
  };

  return {
    plugins,
    skins,
    selectedSkin,
    activeSkin,
    activeSkinMount,
    availableCommands,
    startupAnimations,
    selectedStartup,
    activeStartup,
    activeStartupMount,
    selectSkin,
    selectStartup,
    statusItems,
    commands,
    views,
    openedView,
    mainView,
    navigationEntries,
    collectQuickPicks,
    openView: async (pluginId: string, viewId: string) => {
      let view = views.value.get(`${pluginId}:${viewId}`);
      if (!view) {
        await activateForView(viewId);
        view = views.value.get(`${pluginId}:${viewId}`);
      }
      if (!view) throw new Error(`未声明的视图：${viewId}`);
      openedView.value = view;
    },
    closeView: () => {
      openedView.value = null;
    },
    openMainView: async (pluginId: string, viewId: string) => {
      let view = views.value.get(`${pluginId}:${viewId}`);
      if (!view) {
        await activateForView(viewId);
        view = views.value.get(`${pluginId}:${viewId}`);
      }
      if (!view) throw new Error(`未声明的视图：${viewId}`);
      mainView.value = view;
    },
    closeMainView: () => {
      mainView.value = null;
    },
    version,
    loading,
    error,
    activeSessionId,
    setActiveSession,
    init,
    activateStatusbar,
    activateForExtensions,
    activateForSkins,
    activateForStartup,
    activateForView,
    activateForCommand,
    activateForSlot,
    setEnabled,
    importFromDirectory,
    uninstall,
    loadSettings,
    saveSettings,
    reportPluginFailure,
    reload,
    dispose: deactivateAll,
    shutdown: async (): Promise<void> => {
      await deactivateAll();
      unsubscribeChanges?.();
      unsubscribeChanges = undefined;
      unsubscribeSkinChanges?.();
      unsubscribeSkinChanges = undefined;
      unsubscribeStartupChanges?.();
      unsubscribeStartupChanges = undefined;
      unsubscribeEvents?.();
      unsubscribeEvents = undefined;
      initialized = false;
    }
  };
});
