<template>
  <aside
    v-show="store.open"
    class="nh-terminal-panel"
    :style="{ width: `${store.width}px`, ...terminalCssVariables }"
  >
    <div class="nh-terminal-panel__resize" @pointerdown="startResize" />
    <NConfigProvider
      class="nh-terminal-provider"
      :theme="darkTheme"
      :theme-overrides="terminalThemeOverrides"
    >
      <header class="nh-terminal-panel__header">
        <span class="nh-terminal-panel__title">
          <AppIcon name="terminal" :size="14" />
          {{ t('terminal.title') }}
        </span>
        <div class="nh-terminal-panel__actions">
          <NTooltip placement="bottom" :show-arrow="false">
            <template #trigger>
              <NButton
                text
                size="small"
                class="nh-terminal-panel__icon-button"
                :aria-label="t('terminal.search')"
                @click="toggleSearch"
              >
                <template #icon><AppIcon name="search" :size="17" /></template>
              </NButton>
            </template>
            {{ t('terminal.search') }}
          </NTooltip>
          <PluginSlot
            location="terminal.toolbar"
            :context="{ location: 'terminal.toolbar', sessionId }"
          />
          <NTooltip placement="bottom" :show-arrow="false">
            <template #trigger>
              <NButton
                text
                size="small"
                class="nh-terminal-panel__icon-button"
                :aria-label="t('terminal.hide')"
                @click="store.open = false"
              >
                <template #icon><AppIcon name="close" :size="17" /></template>
              </NButton>
            </template>
            {{ t('terminal.hide') }}
          </NTooltip>
        </div>
      </header>

      <div class="nh-terminal-panel__tabs" role="tablist">
        <VueDraggable
          class="nh-terminal-panel__tab-list"
          :model-value="store.tabs"
          :animation="160"
          handle=".nh-terminal-tab__title"
          ghost-class="nh-terminal-tab--ghost"
          chosen-class="nh-terminal-tab--chosen"
          drag-class="nh-terminal-tab--drag"
          @update:model-value="updateTabOrder"
        >
          <div
            v-for="tab in store.tabs"
            :key="tab.id"
            class="nh-terminal-tab"
            :class="{
              'nh-terminal-tab--active': tab.id === store.activeId,
              'nh-terminal-tab--exited': tab.status !== 'running'
            }"
            role="tab"
            :aria-selected="tab.id === store.activeId"
            @click="store.activeId = tab.id"
            @contextmenu.prevent.stop="openMenu($event, tab)"
          >
            <NInput
              v-if="renamingId === tab.id"
              v-model:value="renameDraft"
              size="tiny"
              :bordered="false"
              @keydown.enter.prevent="commitRename"
              @keydown.esc.prevent="cancelRename"
              @blur="commitRename"
            />
            <span v-else class="nh-terminal-tab__title" @dblclick.stop="startRename(tab)">
              {{ tab.title }}
            </span>
            <NPopconfirm
              trigger="manual"
              :show="confirmTabId === tab.id"
              placement="bottom-end"
              :positive-text="t('terminal.close')"
              :negative-text="t('chat.askUserCancel')"
              @positive-click="confirmClose"
              @negative-click="cancelClose"
              @update:show="
                (value) => {
                  if (!value) cancelClose();
                }
              "
            >
              <template #trigger>
                <button
                  type="button"
                  class="nh-terminal-tab__close"
                  :aria-label="t('terminal.close')"
                  :title="t('terminal.close')"
                  @click.stop="requestClose([tab.id], tab.id)"
                >
                  <AppIcon name="close" :size="12" />
                </button>
              </template>
              {{ t('terminal.closeRunningConfirm') }} ({{ pendingBusyCount }})
            </NPopconfirm>
          </div>
        </VueDraggable>
        <div class="nh-terminal-panel__tab-actions">
          <NTooltip placement="bottom" :show-arrow="false">
            <template #trigger>
              <NButton
                text
                size="small"
                class="nh-terminal-panel__icon-button"
                :disabled="!sessionId"
                :aria-label="t('terminal.newDirectory')"
                @click="createInDirectory"
              >
                <template #icon><AppIcon name="folder" :size="17" /></template>
              </NButton>
            </template>
            {{ t('terminal.newDirectory') }}
          </NTooltip>
          <NTooltip placement="bottom" :show-arrow="false">
            <template #trigger>
              <NButton
                text
                size="small"
                class="nh-terminal-panel__icon-button"
                :disabled="!sessionId"
                :aria-label="t('terminal.new')"
                @click="create()"
              >
                <template #icon><AppIcon name="plus" :size="17" /></template>
              </NButton>
            </template>
            {{ t('terminal.new') }}
          </NTooltip>
        </div>
      </div>

      <div class="nh-terminal-panel__body">
        <div v-if="searchOpen" class="nh-terminal-search">
          <NInput
            ref="searchInput"
            v-model:value="searchTerm"
            size="small"
            :placeholder="t('terminal.searchPlaceholder')"
            @keydown.enter.prevent="runSearch($event.shiftKey ? 'previous' : 'next')"
            @keydown.esc.prevent="closeSearch"
          />
          <span v-if="searchNoResult" class="nh-terminal-search__empty">{{
            t('terminal.noResult')
          }}</span>
          <NButton text size="tiny" :title="t('terminal.previous')" @click="runSearch('previous')">
            <template #icon><AppIcon name="chevron-up" :size="14" /></template>
          </NButton>
          <NButton text size="tiny" :title="t('terminal.next')" @click="runSearch('next')">
            <template #icon><AppIcon name="chevron-down" :size="14" /></template>
          </NButton>
          <NButton text size="tiny" :title="t('terminal.closeSearch')" @click="closeSearch">
            <template #icon><AppIcon name="close" :size="14" /></template>
          </NButton>
        </div>
        <TerminalTab
          v-for="tab in store.tabs"
          v-show="tab.id === store.activeId"
          :key="tab.id"
          :tab="tab"
          :active="tab.id === store.activeId"
          @search="openSearch"
          @contextmenu="openPaneMenu"
        />
        <div
          v-if="menu"
          class="nh-terminal-menu-mask"
          @mousedown="closeMenu"
          @contextmenu.prevent="closeMenu"
        />
        <div
          v-if="menu"
          ref="menuRef"
          class="nh-terminal-menu"
          :style="menuStyle"
          role="menu"
          @mousedown.stop
          @keydown.esc.prevent="closeMenu"
          @keydown.down.prevent="focusMenuItem(1)"
          @keydown.up.prevent="focusMenuItem(-1)"
        >
          <template v-for="item in menuItems" :key="item.key">
            <div v-if="item.divider" class="nh-terminal-menu__divider" />
            <button
              v-else
              type="button"
              class="nh-terminal-menu__item"
              :class="{ 'nh-terminal-menu__item--danger': item.danger }"
              :disabled="item.disabled"
              @click.stop="selectMenu(item.key)"
            >
              {{ item.label }}
            </button>
          </template>
        </div>
        <div v-if="!store.tabs.length" class="nh-terminal-panel__empty">
          <AppIcon name="terminal" :size="20" />
          <p>{{ t('terminal.empty') }}</p>
          <NButton size="small" secondary :disabled="!sessionId" @click="create()">
            {{ t('terminal.new') }}
          </NButton>
        </div>
      </div>
    </NConfigProvider>
  </aside>
</template>

<script setup lang="ts">
/**
 * 右侧内置终端面板：标签、右键菜单、关闭确认与宽度拖拽。
 */

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { darkTheme, NConfigProvider } from 'naive-ui';
import { useMessage, NButton, NInput, NPopconfirm, NTooltip, type InputInst } from 'naive-ui';
import type { TerminalSessionPublic } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import PluginSlot from '@/plugin-runtime/components/PluginSlot.vue';
import { useTerminalStore } from '../stores/terminal.store';
import { terminalCssVariables, terminalThemeOverrides } from '../terminal-theme';
import TerminalTab from './TerminalTab.vue';
import { VueDraggable } from 'vue-draggable-plus';

const props = defineProps<{
  sessionId?: string | undefined;
  shortcutEnabled?: boolean;
}>();
const store = useTerminalStore();
const message = useMessage();
const renamingId = ref<string>();
const renameDraft = ref('');
const creating = ref(false);
interface TerminalMenuState {
  kind: 'tab' | 'pane';
  x: number;
  y: number;
  tab?: TerminalSessionPublic;
}

interface TerminalMenuItem {
  key: string;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
}

const menu = ref<TerminalMenuState>();
const menuRef = ref<HTMLElement>();
const confirmTabId = ref<string>();
const pendingCloseIds = ref<string[]>([]);
const pendingBusyCount = ref(0);
const searchOpen = ref(false);
const searchTerm = ref('');
const searchNoResult = ref(false);
const searchInput = ref<InputInst>();

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

const focusFirstMenuItem = (): void => {
  nextTick(() => menuRef.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus());
};

const focusMenuItem = (direction: number): void => {
  const items = [
    ...(menuRef.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
  ];
  if (!items.length) return;
  const current = items.indexOf(document.activeElement as HTMLButtonElement);
  const next = (current + direction + items.length) % items.length;
  items[next]?.focus();
};

const openMenu = (event: MouseEvent, tab: TerminalSessionPublic): void => {
  menu.value = { kind: 'tab', x: event.clientX, y: event.clientY, tab };
  focusFirstMenuItem();
};

const openPaneMenu = (event: MouseEvent): void => {
  menu.value = { kind: 'pane', x: event.clientX, y: event.clientY };
  focusFirstMenuItem();
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
    searchInput.value?.focus();
    searchInput.value?.select();
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
  max-width: none;
  height: 100%;
  flex-direction: column;
  border-left: 1px solid var(--terminal-border);
  background: var(--terminal-bg);
  color: var(--terminal-text);
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

.nh-terminal-panel__header {
  display: flex;
  height: 56px;
  flex: none;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-bottom: 1px solid var(--terminal-border);
}

.nh-terminal-panel__title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--terminal-secondary);
  font-size: 12px;
}

.nh-terminal-panel__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.nh-terminal-panel__icon-button {
  width: 28px;
  height: 28px;
}

.nh-terminal-panel__tab-actions :deep(.n-button) {
  color: var(--terminal-secondary);
}

.nh-terminal-panel__tab-actions :deep(.n-button:hover) {
  color: var(--terminal-text);
}

.nh-terminal-panel__actions :deep(.n-button) {
  color: var(--terminal-secondary);
}

.nh-terminal-panel__actions :deep(.n-button:hover) {
  color: var(--terminal-text);
}

.nh-terminal-provider {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

.nh-terminal-panel__tabs {
  display: flex;
  flex: none;
  align-items: center;
  gap: 6px;
  min-height: 42px;
  padding: 6px 6px 0;
  border-bottom: 1px solid var(--terminal-border);
}

.nh-terminal-panel__tab-list {
  display: flex;
  min-width: 0;
  flex: 0 1 auto;
  gap: 2px;
  overflow-x: auto;
  max-width: calc(100% - 84px);
}

.nh-terminal-panel__tab-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 4px;
}

.nh-terminal-tab {
  display: flex;
  min-width: 96px;
  max-width: 220px;
  height: 28px;
  align-items: center;
  gap: 4px;
  padding: 0 4px 0 9px;
  border-radius: 6px 6px 0 0;
  color: var(--terminal-secondary);
  font-size: 11px;
  cursor: pointer;
}

.nh-terminal-tab:hover {
  background: var(--terminal-hover);
  color: var(--terminal-text);
}

.nh-terminal-tab--active {
  background: var(--terminal-hover);
  color: var(--terminal-text);
}

.nh-terminal-tab :deep(.n-input) {
  --n-color: var(--terminal-surface);
  --n-color-focus: var(--terminal-surface);
  --n-text-color: var(--terminal-text);
  --n-border: 1px solid var(--terminal-border);
  --n-border-focus: 1px solid var(--terminal-accent);
  --n-border-hover: 1px solid var(--terminal-accent);
}

.nh-terminal-tab__title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-terminal-tab--ghost {
  opacity: 0.35;
}

.nh-terminal-tab--chosen {
  background: var(--terminal-hover);
}

.nh-terminal-tab--drag {
  box-shadow: var(--nh-shadow-popover);
}

.nh-terminal-tab--exited .nh-terminal-tab__title {
  opacity: 0.55;
}

.nh-terminal-tab__close {
  display: grid;
  width: 18px;
  height: 18px;
  flex: none;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--terminal-secondary);
  cursor: pointer;
  opacity: 0;
}

.nh-terminal-tab__close:hover {
  background: color-mix(in srgb, var(--terminal-danger) 24%, var(--terminal-surface));
  color: var(--terminal-text);
}

.nh-terminal-tab--active .nh-terminal-tab__close,
.nh-terminal-tab:hover .nh-terminal-tab__close {
  opacity: 1;
}

.nh-terminal-panel__body {
  position: relative;
  flex: 1;
  min-height: 0;
}

.nh-terminal-search {
  position: absolute;
  z-index: 20;
  top: 10px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: calc(100% - 24px);
  padding: 4px;
  border: 1px solid var(--terminal-border);
  border-radius: 8px;
  background: var(--terminal-surface);
  box-shadow: var(--nh-shadow-popover);
}

.nh-terminal-search :deep(.n-input) {
  width: 220px;

  --n-color: var(--terminal-bg);
  --n-color-focus: var(--terminal-bg);
  --n-text-color: var(--terminal-text);
  --n-border: 1px solid var(--terminal-border);
  --n-border-focus: 1px solid var(--terminal-accent);
  --n-border-hover: 1px solid var(--terminal-accent);
}

.nh-terminal-search__empty {
  color: var(--terminal-danger);
  font-size: 11px;
  white-space: nowrap;
}

.nh-terminal-search :deep(.n-button) {
  color: var(--terminal-secondary);
}

.nh-terminal-search :deep(.n-button:hover) {
  color: var(--terminal-text);
}

.nh-terminal-panel__body > :deep(.nh-terminal-shell) {
  position: absolute;
  inset: 0;
}

.nh-terminal-menu-mask {
  position: fixed;
  z-index: 1000;
  inset: 0;
}

.nh-terminal-menu {
  position: fixed;
  z-index: 1001;
  display: flex;
  width: 208px;
  flex-direction: column;
  gap: 1px;
  padding: 6px;
  border: 1px solid var(--terminal-border);
  border-radius: 10px;
  background: var(--terminal-surface);
  box-shadow: var(--nh-shadow-popover);
}

.nh-terminal-menu__divider {
  height: 1px;
  margin: 4px 6px;
  background: var(--terminal-border);
}

.nh-terminal-menu__item {
  width: 100%;
  height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--terminal-text);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.nh-terminal-menu__item:disabled {
  color: var(--terminal-disabled);
  cursor: not-allowed;
}

.nh-terminal-menu__item--danger {
  color: var(--terminal-danger);
}

.nh-terminal-menu__item:hover:not(:disabled) {
  background: var(--terminal-hover);
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
