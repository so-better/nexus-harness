<template>
  <aside
    v-show="store.open"
    class="nh-terminal-panel"
    :style="{ width: `${store.width}px`, ...terminalCssVariables }"
  >
    <div class="nh-terminal-panel__resize" @pointerdown="startResize" />
    <header class="nh-terminal-panel__header">
      <span class="nh-terminal-panel__title">
        <AppIcon name="terminal" :size="14" />
        {{ t('terminal.title') }}
      </span>
      <div class="nh-terminal-panel__actions">
        <NButton text size="tiny" :disabled="!sessionId" :title="t('terminal.new')" @click="create">
          <template #icon><AppIcon name="plus" :size="14" /></template>
        </NButton>
        <NButton text size="tiny" :title="t('terminal.hide')" @click="store.open = false">
          <template #icon><AppIcon name="close" :size="14" /></template>
        </NButton>
      </div>
    </header>

    <div class="nh-terminal-panel__tabs" role="tablist">
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
        <span v-else class="nh-terminal-tab__title">{{ tab.title }}</span>
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
      <NDropdown
        trigger="manual"
        :show="menuShow"
        :x="menuX"
        :y="menuY"
        :options="menuOptions()"
        @select="selectMenu"
        @clickoutside="menuShow = false"
      />
    </div>

    <div class="nh-terminal-panel__body">
      <TerminalTab
        v-for="tab in store.tabs"
        v-show="tab.id === store.activeId"
        :key="tab.id"
        :tab="tab"
        :active="tab.id === store.activeId"
      />
      <div v-if="!store.tabs.length" class="nh-terminal-panel__empty">
        <AppIcon name="terminal" :size="20" />
        <p>{{ t('terminal.empty') }}</p>
        <NButton size="small" secondary :disabled="!sessionId" @click="create">
          {{ t('terminal.new') }}
        </NButton>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
/**
 * 右侧内置终端面板：标签、右键菜单、关闭确认与宽度拖拽。
 */

import { nextTick, ref, watch } from 'vue';
import { useMessage, NButton, NDropdown, NInput, NPopconfirm, type DropdownOption } from 'naive-ui';
import type { TerminalSessionPublic } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import { useTerminalStore } from '../stores/terminal.store';
import { terminalCssVariables } from '../terminal-theme';
import TerminalTab from './TerminalTab.vue';

const props = defineProps<{ sessionId?: string | undefined }>();
const store = useTerminalStore();
const message = useMessage();
const renamingId = ref<string>();
const renameDraft = ref('');
const creating = ref(false);
const menuShow = ref(false);
const menuX = ref(0);
const menuY = ref(0);
const menuTab = ref<TerminalSessionPublic>();
const confirmTabId = ref<string>();
const pendingCloseIds = ref<string[]>([]);
const pendingBusyCount = ref(0);
let resizing = false;
let startX = 0;
let startWidth = 0;

/**
 * 新建终端；没有工作区时由主进程返回明确错误。
 */
const create = async (): Promise<void> => {
  if (!props.sessionId || creating.value) return;
  creating.value = true;
  try {
    const created = await store.create(props.sessionId);
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
 * 右键菜单：关闭当前、其他、右侧与重命名。
 */
const menuOptions = (): DropdownOption[] => [
  { key: 'close', label: t('terminal.close') },
  { key: 'close-others', label: t('terminal.closeOthers') },
  { key: 'close-right', label: t('terminal.closeRight') },
  { key: 'rename', label: t('terminal.rename') }
];

/**
 * 在鼠标位置打开标签右键菜单。
 */
const openMenu = (event: MouseEvent, tab: TerminalSessionPublic): void => {
  menuTab.value = tab;
  menuX.value = event.clientX;
  menuY.value = event.clientY;
  menuShow.value = true;
};

const selectMenu = (key: string): void => {
  const tab = menuTab.value;
  menuShow.value = false;
  if (!tab) return;
  const index = store.tabs.findIndex((item) => item.id === tab.id);
  if (key === 'close') requestClose([tab.id], tab.id);
  else if (key === 'close-others') {
    requestClose(
      store.tabs.filter((item) => item.id !== tab.id).map((item) => item.id),
      tab.id
    );
  } else if (key === 'close-right') {
    requestClose(
      store.tabs.slice(index + 1).map((item) => item.id),
      tab.id
    );
  } else if (key === 'rename') {
    renamingId.value = tab.id;
    renameDraft.value = tab.title;
    nextTick(() => {
      const input = document.querySelector<HTMLInputElement>('.nh-terminal-tab input');
      input?.focus();
      input?.select();
    });
  }
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

/**
 * 拖拽左侧分隔条调整面板宽度；默认约占窗口一半。
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
  gap: 4px;
}

.nh-terminal-panel__actions :deep(.n-button) {
  color: var(--terminal-secondary);
}

.nh-terminal-panel__actions :deep(.n-button:hover) {
  color: var(--terminal-text);
}

.nh-terminal-panel__tabs {
  display: flex;
  flex: none;
  gap: 2px;
  overflow-x: auto;
  padding: 6px 6px 0;
  border-bottom: 1px solid var(--terminal-border);
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

.nh-terminal-panel__body > :deep(.nh-terminal-view) {
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
