/**
 * 应用命令：注册内置命令、合并插件命令并处理全局快捷键。
 */
import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue';
import type { SessionSummary } from '@shared/ipc/contracts';
import type { AppIconName } from '@/components/AppIcon.vue';
import { t } from '@/app/i18n';
import { CommandRegistry, type CommandDefinition } from '@/app/command-registry';
import type { PaletteCommand } from '@/app/commands';
import { matchesShortcut } from '@/app/shortcuts';
import type { usePluginRuntimeStore } from '@/plugin-runtime/runtime.store';

interface AppCommandOptions {
  pluginRuntime: ReturnType<typeof usePluginRuntimeStore>;
  activeRunning: Ref<boolean>;
  sessions: Ref<SessionSummary[]>;
  openSession: (id: string) => void;
  createSession: () => Promise<void>;
  openSearch: () => void | Promise<void>;
  openSettings: () => void;
  openExtensions: () => void;
  toggleTerminal: () => void;
  openChangelog: () => void;
  toggleTheme: () => void;
  stop: () => Promise<void>;
  showError: (message: string) => void;
}

const resolveTitle = (command: CommandDefinition): string =>
  typeof command.title === 'function' ? command.title() : command.title;

/**
 * 创建命令面板状态、命令列表与窗口级快捷键监听。
 */
export const useAppCommands = (options: AppCommandOptions) => {
  const commandPaletteOpen = ref(false);
  const registry = new CommandRegistry();

  const openCommandPalette = async (): Promise<void> => {
    try {
      await options.pluginRuntime.activateForExtensions();
    } catch (reason) {
      options.showError(reason instanceof Error ? reason.message : t('commands.failed'));
    }
    commandPaletteOpen.value = true;
  };

  const toggleCommandPalette = (): void => {
    if (commandPaletteOpen.value) {
      commandPaletteOpen.value = false;
      return;
    }
    openCommandPalette().catch((error: unknown) => {
      console.error('打开命令面板失败', error);
    });
  };

  const executeCommand = async (id: string): Promise<void> => {
    try {
      if (id.startsWith('session.open:')) {
        options.openSession(id.slice('session.open:'.length));
        return;
      }
      if (id.startsWith('plugin:')) {
        const command = options.pluginRuntime.commands.get(id.slice('plugin:'.length));
        await command?.handler();
        return;
      }
      await registry.execute(id);
    } catch (reason) {
      options.showError(reason instanceof Error ? reason.message : t('commands.failed'));
    }
  };

  const builtInCommands: CommandDefinition[] = [
    {
      id: 'session.new',
      title: () => t('app.newSession'),
      shortcut: 'CmdOrCtrl+N',
      handler: options.createSession
    },
    {
      id: 'session.search',
      title: () => t('search.open'),
      shortcut: 'CmdOrCtrl+Shift+F',
      handler: options.openSearch
    },
    {
      id: 'settings.open',
      title: () => t('app.settings'),
      shortcut: 'CmdOrCtrl+,',
      handler: options.openSettings
    },
    {
      id: 'extensions.open',
      title: () => t('plugins.open'),
      shortcut: 'CmdOrCtrl+Shift+E',
      handler: options.openExtensions
    },
    {
      id: 'terminal.toggle',
      title: () => t('terminal.title'),
      shortcut: 'CmdOrCtrl+J',
      handler: options.toggleTerminal
    },
    {
      id: 'changelog.open',
      title: () => t('changelog.open'),
      handler: options.openChangelog
    },
    {
      id: 'theme.toggle',
      title: () => t('commands.toggleTheme'),
      shortcut: 'CmdOrCtrl+Shift+L',
      handler: options.toggleTheme
    },
    {
      id: 'session.stop',
      title: () => t('app.stop'),
      handler: options.stop,
      isEnabled: () => options.activeRunning.value
    }
  ];

  const commandIcons: Record<string, AppIconName> = {
    'session.new': 'plus',
    'session.search': 'search',
    'settings.open': 'settings',
    'extensions.open': 'plug',
    'terminal.toggle': 'terminal',
    'changelog.open': 'history',
    'theme.toggle': 'sun',
    'session.stop': 'stop'
  };

  for (const command of builtInCommands) registry.register(command);

  const paletteCommands = computed<PaletteCommand[]>(() => {
    return [
      ...registry
        .list()
        .filter((command) => (command.isEnabled ? command.isEnabled() : true))
        .map((command) => ({
          id: command.id,
          title: resolveTitle(command),
          ...(command.shortcut ? { shortcut: command.shortcut } : {}),
          source: t('commands.builtin'),
          ...(commandIcons[command.id] ? { icon: commandIcons[command.id] } : {})
        })),
      ...options.sessions.value.slice(0, 8).map((session) => ({
        id: `session.open:${session.id}`,
        title: session.title,
        source: t('commands.sessions'),
        icon: 'message' as const
      })),
      ...Array.from(options.pluginRuntime.commands.values()).map((command) => ({
        id: `plugin:${command.id}`,
        title: command.title,
        ...(command.shortcut ? { shortcut: command.shortcut } : {}),
        source: t('commands.plugin'),
        icon: 'plug' as const
      }))
    ];
  });

  const onGlobalKeydown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) return;
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.isContentEditable ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT') &&
      !event.metaKey &&
      !event.ctrlKey
    ) {
      return;
    }
    // 终端内 Cmd+K / Ctrl+L 保留给清屏，避免与命令面板快捷键冲突
    if (target?.closest('.nh-terminal-panel')) {
      const terminalKey = event.key.toLowerCase();
      if (terminalKey === 'k') return;
      if (terminalKey === 'l' && event.ctrlKey && !event.metaKey) return;
    }
    if (matchesShortcut(event, 'CmdOrCtrl+K')) {
      event.preventDefault();
      toggleCommandPalette();
      return;
    }
    const command = paletteCommands.value.find(
      (item) => item.shortcut && matchesShortcut(event, item.shortcut)
    );
    if (!command) return;
    event.preventDefault();
    executeCommand(command.id).catch((error: unknown) => {
      console.error('执行命令失败', error);
    });
  };

  onMounted(() => window.addEventListener('keydown', onGlobalKeydown));
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onGlobalKeydown);
    registry.clear();
  });

  return {
    commandPaletteOpen,
    paletteCommands,
    toggleCommandPalette,
    executeCommand
  };
};
