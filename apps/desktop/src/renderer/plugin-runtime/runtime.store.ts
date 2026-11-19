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
  PluginWorkspaceEntry
} from '@shared/plugin';
import {
  deletePluginStorage,
  getPluginSettings,
  getPluginStorage,
  getSelectedSkin,
  listPlugins,
  logPlugin,
  notifyPlugin,
  importPluginDirectory,
  reloadPlugins,
  reportPluginError,
  readPluginWorkspace,
  listPluginWorkspace,
  openPluginDirectory,
  setPluginEnabled,
  setPluginSettings,
  setPluginStorage,
  setSelectedSkin,
  subscribePluginChanges,
  subscribePluginEvents,
  uninstallPlugin
} from './api/plugin.api';
import { slotRegistry, type SlotContext } from './slot-registry';

export interface PluginSkin {
  pluginId: string;
  pluginName: string;
  id: string;
  title: string;
}

export type PluginSkinMount = (element: HTMLElement, ctx: PluginContext) => () => void;

export interface ActivePluginSkin extends PluginSkin {
  mount: PluginSkinMount;
  context: PluginContext;
}

export interface PluginStatusItem {
  id: string;
  text: string;
  align: 'left' | 'right';
  title?: string;
  onClick?: () => void;
}

export interface PluginCommand {
  id: string;
  title: string;
  shortcut?: string;
  handler: () => void | Promise<void>;
}

export interface PluginView {
  pluginId: string;
  id: string;
  title: string;
  location: 'sidebar' | 'main' | 'bottom';
  mount: (element: HTMLElement, ctx: PluginContext) => () => void;
  context: PluginContext;
}

export interface PluginContext {
  pluginId: string;
  commands: {
    register: (id: string, handler: () => void | Promise<void>) => () => void;
  };
  views: {
    register: (id: string, mount: PluginView['mount']) => () => void;
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
  statusBar: {
    add: (item: Omit<PluginStatusItem, 'align'> & { align?: 'left' | 'right' }) => () => void;
  };
  events: { on: (event: string, handler: (payload: unknown) => void) => () => void };
  storage: {
    get: <T>(key: string) => Promise<T | undefined>;
    set: <T>(key: string, value: T) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
  settings: Record<string, PluginSettingValue>;
  logger: {
    debug: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };
  notifications: { show: (message: string, level?: 'info' | 'warning' | 'error') => void };
  workspace: {
    readFile: (path: string) => Promise<string>;
    list: (dir?: string) => Promise<PluginWorkspaceEntry[]>;
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
  const views = ref(new Map<string, PluginView>());
  const version = ref(0);
  const loading = ref(false);
  const error = ref<string>();
  const selectedSkin = ref<PluginSkinSelection | null>(null);
  const skinMounts = ref(new Map<string, { mount: PluginSkinMount; context: PluginContext }>());
  const activeSessionId = ref<string>();
  const active = new Map<string, ActivePlugin>();
  const eventHandlers = new Map<string, Set<(payload: unknown) => void>>();
  const activating = new Set<string>();
  let initialized = false;
  let unsubscribeChanges: (() => void) | undefined;
  let unsubscribeEvents: (() => void) | undefined;
  let activationNonce = 0;

  const skins = computed<PluginSkin[]>(() =>
    plugins.value.flatMap((plugin) =>
      plugin.enabled
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
    if (
      !plugin.enabled ||
      !plugin.rendererUrl ||
      active.has(plugin.id) ||
      activating.has(plugin.id)
    )
      return;
    activating.add(plugin.id);
    let disposable: ActivePlugin | undefined;
    try {
      const url = `${plugin.rendererUrl}?v=${plugin.version}-${activationNonce}`;
      const module = (await import(/* @vite-ignore */ url)) as {
        activate?: (ctx: PluginContext) => void | Promise<void>;
        deactivate?: () => void | Promise<void>;
      };
      if (typeof module.activate !== 'function') throw new Error('renderer 入口缺少 activate');
      const currentDisposable: ActivePlugin = { module, disposables: [] };
      disposable = currentDisposable;
      const settings = await getPluginSettings(plugin.id);
      const manifest = plugin as unknown as PluginManifest;
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
            commands.value.set(id, command);
            bump();
            const dispose = (): void => {
              commands.value.delete(id);
              bump();
            };
            currentDisposable.disposables.push(dispose);
            return dispose;
          }
        },
        views: {
          register: (id, mount) => {
            if (!hasPermission(plugin, 'ui.panel')) throw new Error('缺少 ui.panel 权限');
            const contribution = manifest.contributes.views.find((item) => item.id === id);
            if (!contribution) throw new Error(`未声明的视图：${id}`);
            views.value.set(id, {
              pluginId: plugin.id,
              id,
              title: contribution.title,
              location: contribution.location,
              mount,
              context: ctx
            });
            bump();
            const dispose = (): void => {
              views.value.delete(id);
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
              mount
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
        logger: {
          debug: (message) => logPlugin(plugin.id, 'debug', message).catch(() => undefined),
          info: (message) => logPlugin(plugin.id, 'info', message).catch(() => undefined),
          warn: (message) => logPlugin(plugin.id, 'warn', message).catch(() => undefined),
          error: (message) => logPlugin(plugin.id, 'error', message).catch(() => undefined)
        },
        notifications: {
          show: (message, level = 'info') => {
            if (!hasPermission(plugin, 'ui.notification')) {
              throw new Error('缺少 ui.notification 权限');
            }
            notifyPlugin(plugin.id, message, level).catch(() => undefined);
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
    commands.value.clear();
    views.value.clear();
    slotRegistry.clear();
    skinMounts.value = new Map();
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
        handler(event.payload);
      } catch (reason) {
        error.value = reason instanceof Error ? reason.message : String(reason);
      }
    }
  };

  const init = async (): Promise<void> => {
    if (initialized) return;
    initialized = true;
    loading.value = true;
    try {
      plugins.value = await listPlugins();
      selectedSkin.value = await getSelectedSkin();
      bump();
      unsubscribeChanges = subscribePluginChanges((next) => {
        applyPlugins(next).catch((reason: unknown) => notifyError('plugin-runtime', reason));
      });
      unsubscribeEvents = subscribePluginEvents((event) => {
        if (event.type === 'message.delta') return;
        dispatchEvent(event).catch((reason: unknown) => notifyError('plugin-runtime', reason));
      });
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
    } finally {
      loading.value = false;
    }
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
      notifyError('plugin-runtime', reason);
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

  const openDirectory = async (): Promise<void> => {
    await openPluginDirectory();
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

  const importFromDirectory = async (): Promise<void> => {
    error.value = undefined;
    try {
      await applyPlugins(await importPluginDirectory());
    } catch (reason) {
      const messageText = reason instanceof Error ? reason.message : String(reason);
      error.value = messageText;
      reportPluginError('plugin-runtime', messageText).catch(() => undefined);
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

  return {
    plugins,
    skins,
    selectedSkin,
    activeSkin,
    activeSkinMount,
    selectSkin,
    statusItems,
    commands,
    views,
    version,
    loading,
    error,
    activeSessionId,
    setActiveSession,
    init,
    activateStatusbar,
    activateForExtensions,
    activateForSkins,
    activateForSlot,
    setEnabled,
    importFromDirectory,
    uninstall,
    openDirectory,
    loadSettings,
    saveSettings,
    reportPluginFailure,
    reload,
    dispose: deactivateAll,
    shutdown: async (): Promise<void> => {
      await deactivateAll();
      unsubscribeChanges?.();
      unsubscribeChanges = undefined;
      unsubscribeEvents?.();
      unsubscribeEvents = undefined;
      initialized = false;
    }
  };
});
