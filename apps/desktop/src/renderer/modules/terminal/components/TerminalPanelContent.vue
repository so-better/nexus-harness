<template>
  <aside
    v-show="store.open"
    class="nh-terminal-panel"
    :style="{ width: `${store.width}px`, ...terminalCssVariables }"
  >
    <div class="nh-terminal-panel__resize" @pointerdown="startResize" />
    <TerminalPanelHeader
      :session-id="sessionId"
      @toggle-search="toggleSearch"
      @hide="store.open = false"
    />

    <TerminalTabBar
      :tabs="store.tabs"
      :active-id="store.activeId"
      :session-id="sessionId"
      :renaming-id="renamingId"
      :rename-draft="renameDraft"
      :confirm-tab-id="confirmTabId"
      :pending-busy-count="pendingBusyCount"
      @select="store.activeId = $event"
      @contextmenu="openMenu"
      @start-rename="startRename"
      @commit-rename="commitRename"
      @cancel-rename="cancelRename"
      @update:rename-draft="renameDraft = $event"
      @request-close="requestClose"
      @confirm-close="confirmClose"
      @cancel-close="cancelClose"
      @update-order="updateTabOrder"
      @create="create()"
      @create-directory="createInDirectory"
    />

    <div class="nh-terminal-panel__body">
      <TerminalSearchBar
        v-if="searchOpen"
        ref="searchBar"
        :term="searchTerm"
        :no-result="searchNoResult"
        @update:term="searchTerm = $event"
        @run="runSearch"
        @close="closeSearch"
      />
      <TerminalTab
        v-for="tab in store.tabs"
        v-show="tab.id === store.activeId"
        :key="tab.id"
        :tab="tab"
        :active="tab.id === store.activeId"
        @search="openSearch"
        @contextmenu="openPaneMenu"
      />
      <TerminalContextMenu
        v-if="menu"
        :menu="menu"
        :items="menuItems"
        :menu-style="menuStyle"
        @close="closeMenu"
        @select="selectMenu"
      />
      <div v-if="!store.tabs.length" class="nh-terminal-panel__empty">
        <AppIcon name="terminal" :size="20" />
        <p>{{ t('terminal.empty') }}</p>
        <NButton size="small" secondary :disabled="!sessionId" @click="create()">
          {{ t('terminal.new') }}
        </NButton>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
/**
 * 终端面板内容：标签、右键菜单、关闭确认与宽度拖拽；宿主只负责深色 Naive UI 上下文。
 */

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useMessage, NButton } from 'naive-ui';
import type { TerminalSessionPublic } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import { useTerminalStore } from '../stores/terminal.store';
import { terminalCssVariables } from '../terminal-theme';
import type { TerminalMenuState, TerminalMenuItem } from '../terminal-menu';
import TerminalPanelHeader from './TerminalPanelHeader.vue';
import TerminalTabBar from './TerminalTabBar.vue';
import TerminalSearchBar from './TerminalSearchBar.vue';
import TerminalContextMenu from './TerminalContextMenu.vue';
import TerminalTab from './TerminalTab.vue';

const props = defineProps<{
  sessionId?: string | undefined;
  shortcutEnabled?: boolean;
}>();
const store = useTerminalStore();
const message = useMessage();
const renamingId = ref<string>();
const renameDraft = ref('');
const creating = ref(false);
const menu = ref<TerminalMenuState>();
const confirmTabId = ref<string>();
const pendingCloseIds = ref<string[]>([]);
const pendingBusyCount = ref(0);
const searchOpen = ref(false);
const searchTerm = ref('');
const searchNoResult = ref(false);
const searchBar = ref<{ focus: () => void }>();

let resizing = false;
let startX = 0;
let startWidth = 0;

/**
 * 新建终端；没有工作区时由主进程返回明确错误。
 */
const create = async (cwd?: string): Promise<void> => {
  if (!props.sessionId || creating.value) return;
  creating.value = true;
  try {
    const created = await store.create(props.sessionId, cwd);
    if (!created) message.error(store.error ?? t('terminal.createFailed'));
  } finally {
    creating.value = false;
  }
};

/**
 * 打开面板时如果没有终端，自动创建第一个标签。
 */
watch(
  [() => store.open, () => store.ready, () => store.tabs.length, () => props.sessionId],
  () => {
    if (store.open && store.ready && !store.tabs.length && props.sessionId) {
      create().catch(() => undefined);
    }
  },
  { immediate: true }
);

/**
 * 选择目录后在该目录新建终端。
 */
const createInDirectory = async (): Promise<void> => {
  if (!props.sessionId) return;
  const cwd = await store.selectDirectory();
  if (!cwd) return;
  await create(cwd);
};

const startRename = (tab: TerminalSessionPublic): void => {
  renamingId.value = tab.id;
  renameDraft.value = tab.title;
  nextTick(() => {
    const input = document.querySelector<HTMLInputElement>('.nh-terminal-tab input');
    input?.focus();
    input?.select();
  });
};

/**
 * 关闭前检查运行中的终端并要求二次确认。
 */
const requestClose = (ids: string[], anchorId: string): void => {
  store
    .busy(ids)
    .then((busyIds) => {
      if (busyIds.length) {
        pendingCloseIds.value = ids;
        pendingBusyCount.value = busyIds.length;
        confirmTabId.value = anchorId;
        return;
      }
      ids.forEach((id) => store.close(id).catch(() => undefined));
    })
    .catch(() => {
      pendingCloseIds.value = ids;
      pendingBusyCount.value = ids.length;
      confirmTabId.value = anchorId;
    });
};

/**
 * 确认关闭 popconfirm 中待处理的终端。
 */
const confirmClose = (): void => {
  pendingCloseIds.value.forEach((id) => store.close(id).catch(() => undefined));
  pendingCloseIds.value = [];
  pendingBusyCount.value = 0;
  confirmTabId.value = undefined;
};

const cancelClose = (): void => {
  pendingCloseIds.value = [];
  pendingBusyCount.value = 0;
  confirmTabId.value = undefined;
};

/**
 * 右键菜单项：按标签或终端内容切换动作。
 */
const menuItems = computed<TerminalMenuItem[]>(() => {
  if (!menu.value) return [];
  if (menu.value.kind === 'pane') {
    const controller = store.controller(store.activeId);
    return [
      { key: 'copy', label: t('terminal.copy'), disabled: !controller },
      { key: 'paste', label: t('terminal.paste'), disabled: !controller },
      { key: 'select-all', label: t('terminal.selectAll'), disabled: !controller },
      { key: 'clear', label: t('terminal.clear'), disabled: !controller },
      { key: 'divider-pane', label: '', divider: true },
      { key: 'new-tab', label: t('terminal.new') },
      { key: 'close-tab', label: t('terminal.close'), danger: true }
    ];
  }
  return [
    { key: 'rename', label: t('terminal.rename') },
    { key: 'same-directory', label: t('terminal.newSameDirectory') },
    { key: 'reset-title', label: t('terminal.resetTitle') },
    ...(menu.value.tab?.source === 'user'
      ? [
          {
            key: 'toggle-ai-access',
            label: menu.value.tab.aiAccess
              ? t('terminal.disableAiAccess')
              : t('terminal.enableAiAccess')
          }
        ]
      : []),
    { key: 'divider-tab', label: '', divider: true },
    { key: 'close', label: t('terminal.close'), danger: true },
    { key: 'close-others', label: t('terminal.closeOthers') },
    { key: 'close-right', label: t('terminal.closeRight') }
  ];
});

/**
 * 菜单固定在鼠标位置，并限制在窗口内。
 */
const menuStyle = computed(() => {
  if (!menu.value) return {};
  const width = 208;
  const height = menuItems.value.reduce((total, item) => total + (item.divider ? 9 : 30), 12);
  return {
    left: `${Math.max(8, Math.min(menu.value.x, window.innerWidth - width - 8))}px`,
    top: `${Math.max(8, Math.min(menu.value.y, window.innerHeight - height - 8))}px`
  };
});

const closeMenu = (): void => {
  menu.value = undefined;
};

const openMenu = (event: MouseEvent, tab: TerminalSessionPublic): void => {
  menu.value = { kind: 'tab', x: event.clientX, y: event.clientY, tab };
};

const openPaneMenu = (event: MouseEvent): void => {
  menu.value = { kind: 'pane', x: event.clientX, y: event.clientY };
};

const selectMenu = async (key: string): Promise<void> => {
  const state = menu.value;
  closeMenu();
  if (!state) return;

  if (state.kind === 'pane') {
    const id = store.activeId;
    const controller = store.controller(id);
    if (!id) return;
    if (key === 'copy') await controller?.copy();
    else if (key === 'paste') await controller?.paste();
    else if (key === 'select-all') controller?.selectAll();
    else if (key === 'clear') controller?.clear();
    else if (key === 'new-tab') await create();
    else if (key === 'close-tab') requestClose([id], id);
    controller?.focus();
    return;
  }

  const tab = state.tab;
  if (!tab) return;
  const index = store.tabs.findIndex((item) => item.id === tab.id);
  if (key === 'close') requestClose([tab.id], tab.id);
  else if (key === 'same-directory') {
    store
      .currentDirectory(tab.id)
      .then((cwd) => create(cwd ?? undefined))
      .catch(() => message.error(t('terminal.cwdReadFailed')));
  } else if (key === 'reset-title') {
    store.resetTitle(tab.id);
  } else if (key === 'rename') {
    startRename(tab);
  } else if (key === 'toggle-ai-access') {
    const enabling = !tab.aiAccess;
    const saved = await store.setAiAccess(tab.id, enabling);
    if (!saved) message.error(t('terminal.aiAccessFailed'));
    else if (enabling) message.warning(t('terminal.aiAccessWarning'));
  } else if (key === 'close-others') {
    requestClose(
      store.tabs.filter((item) => item.id !== tab.id).map((item) => item.id),
      tab.id
    );
  } else if (key === 'close-right') {
    requestClose(
      store.tabs.slice(index + 1).map((item) => item.id),
      tab.id
    );
  }
};

const updateTabOrder = async (next: TerminalSessionPublic[]): Promise<void> => {
  const saved = await store.setTabOrder(next);
  if (!saved) message.error(t('terminal.reorderFailed'));
};

const commitRename = (): void => {
  if (!renamingId.value) return;
  store.rename(renamingId.value, renameDraft.value);
  renamingId.value = undefined;
};

const cancelRename = (): void => {
  renamingId.value = undefined;
  renameDraft.value = '';
};

const openSearch = (): void => {
  closeMenu();
  searchOpen.value = true;
  nextTick(() => {
    searchBar.value?.focus();
  });
};

const toggleSearch = (): void => {
  if (searchOpen.value) closeSearch();
  else openSearch();
};

const closeSearch = (): void => {
  searchOpen.value = false;
  searchTerm.value = '';
  searchNoResult.value = false;
  store.controller(store.activeId)?.clearSearch();
  store.controller(store.activeId)?.focus();
};

const runSearch = (direction: 'next' | 'previous'): void => {
  const controller = store.controller(store.activeId);
  if (!controller || !searchTerm.value) {
    searchNoResult.value = false;
    return;
  }
  const found =
    direction === 'next'
      ? controller.findNext(searchTerm.value)
      : controller.findPrevious(searchTerm.value);
  searchNoResult.value = !found;
};

watch(
  () => store.activeId,
  () => {
    store.controller(store.activeId)?.clearSearch();
    if (searchOpen.value && searchTerm.value) nextTick(() => runSearch('next'));
  }
);

watch(searchTerm, () => {
  if (!searchOpen.value) return;
  nextTick(() => runSearch('next'));
});

/**
 * 终端面板打开时，在页面级响应搜索快捷键。
 */
const onSearchShortcut = (event: KeyboardEvent): void => {
  if (!store.open || props.shortcutEnabled === false || event.defaultPrevented) return;
  const isFind =
    (event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.shiftKey &&
      event.key.toLowerCase() === 'f') ||
    (event.ctrlKey &&
      event.shiftKey &&
      !event.metaKey &&
      !event.altKey &&
      event.key.toLowerCase() === 'f');
  if (!isFind) return;
  event.preventDefault();
  event.stopPropagation();
  openSearch();
};

onMounted(() => window.addEventListener('keydown', onSearchShortcut, true));
onBeforeUnmount(() => window.removeEventListener('keydown', onSearchShortcut, true));

/**
 * 拖拽左侧分隔条调整面板宽度；默认 600px。
 */
const startResize = (event: PointerEvent): void => {
  resizing = true;
  startX = event.clientX;
  startWidth = store.width;
  event.preventDefault();
  window.addEventListener('pointermove', moveResize);
  window.addEventListener('pointerup', stopResize, { once: true });
};

const moveResize = (event: PointerEvent): void => {
  if (!resizing) return;
  store.setWidth(startWidth + (startX - event.clientX));
};

const stopResize = (): void => {
  resizing = false;
  window.removeEventListener('pointermove', moveResize);
};
</script>

<style scoped lang="less">
.nh-terminal-panel {
  position: relative;
  display: flex;
  flex: none;
  min-width: 280px;
  max-width: max(280px, calc(100vw - var(--nh-sidebar-w, 248px) - 480px));
  height: 100%;
  flex-direction: column;
  border-left: 1px solid var(--terminal-border);
  background: var(--terminal-bg);
  color: var(--terminal-text);
}

@media (width <= 880px) {
  // 窄窗口下改为浮层，避免终端停靠把对话区压到不可用
  .nh-terminal-panel {
    position: absolute;
    z-index: var(--nh-z-overlay);
    top: 0;
    right: 0;
    bottom: 0;
    max-width: min(520px, calc(100vw - var(--nh-sidebar-w-narrow, 232px)));
    box-shadow: var(--nh-shadow-float);
  }
}

.nh-terminal-panel__resize {
  position: absolute;
  z-index: 2;
  top: 0;
  bottom: 0;
  left: -3px;
  width: 6px;
  cursor: col-resize;
}

.nh-terminal-panel__resize:hover {
  background: color-mix(in srgb, var(--terminal-accent) 48%, transparent);
}

.nh-terminal-panel__body {
  position: relative;
  flex: 1;
  min-height: 0;
}

.nh-terminal-panel__body > :deep(.nh-terminal-shell) {
  position: absolute;
  inset: 0;
}

.nh-terminal-panel__empty {
  display: grid;
  height: 100%;
  place-content: center;
  justify-items: center;
  gap: 10px;
  color: var(--terminal-secondary);
  font-size: 12px;
}
</style>
