<template>
  <div class="nh-terminal-panel__tabs" role="tablist">
    <VueDraggable
      class="nh-terminal-panel__tab-list"
      :model-value="tabs"
      :animation="160"
      handle=".nh-terminal-tab__title"
      ghost-class="nh-terminal-tab--ghost"
      chosen-class="nh-terminal-tab--chosen"
      drag-class="nh-terminal-tab--drag"
      @update:model-value="emit('update-order', $event)"
    >
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="nh-terminal-tab"
        :class="{
          'nh-terminal-tab--active': tab.id === activeId,
          'nh-terminal-tab--exited': tab.status !== 'running'
        }"
        role="tab"
        :aria-selected="tab.id === activeId"
        @click="emit('select', tab.id)"
        @contextmenu.prevent.stop="emit('contextmenu', $event, tab)"
      >
        <NInput
          v-if="renamingId === tab.id"
          :value="renameDraft"
          size="tiny"
          :bordered="false"
          @update:value="emit('update:rename-draft', $event)"
          @keydown.enter.prevent="emit('commit-rename')"
          @keydown.esc.prevent="emit('cancel-rename')"
          @blur="emit('commit-rename')"
        />
        <span v-else class="nh-terminal-tab__title" @dblclick.stop="emit('start-rename', tab)">
          {{ tab.title }}
        </span>
        <NPopconfirm
          :theme-overrides="terminalPopconfirmThemeOverrides"
          trigger="manual"
          :show="confirmTabId === tab.id"
          placement="bottom-end"
          :positive-text="t('terminal.close')"
          :negative-text="t('chat.askUserCancel')"
          @positive-click="emit('confirm-close')"
          @negative-click="emit('cancel-close')"
          @update:show="
            (value) => {
              if (!value) emit('cancel-close');
            }
          "
        >
          <template #trigger>
            <NTooltip
              :theme="tooltipDark"
              :theme-overrides="terminalTooltipThemeOverrides"
              placement="top"
            >
              <template #trigger>
                <button
                  type="button"
                  class="nh-terminal-tab__close"
                  :aria-label="t('terminal.close')"
                  @click.stop="emit('request-close', [tab.id], tab.id)"
                >
                  <AppIcon name="close" :size="12" />
                </button>
              </template>
              {{ t('terminal.close') }}
            </NTooltip>
          </template>
          {{ t('terminal.closeRunningConfirm') }} ({{ pendingBusyCount }})
        </NPopconfirm>
      </div>
    </VueDraggable>
    <div class="nh-terminal-panel__tab-actions">
      <NTooltip
        :theme="tooltipDark"
        :theme-overrides="terminalTooltipThemeOverrides"
        placement="bottom"
      >
        <template #trigger>
          <NButton
            text
            size="small"
            class="nh-terminal-panel__icon-button"
            :disabled="!sessionId"
            :aria-label="t('terminal.newDirectory')"
            @click="emit('create-directory')"
          >
            <template #icon>
              <AppIcon name="folder" :size="17" />
            </template>
          </NButton>
        </template>
        {{ t('terminal.newDirectory') }}
      </NTooltip>
      <NTooltip
        :theme="tooltipDark"
        :theme-overrides="terminalTooltipThemeOverrides"
        placement="bottom"
      >
        <template #trigger>
          <NButton
            text
            size="small"
            class="nh-terminal-panel__icon-button"
            :disabled="!sessionId"
            :aria-label="t('terminal.new')"
            @click="emit('create')"
          >
            <template #icon>
              <AppIcon name="plus" :size="17" />
            </template>
          </NButton>
        </template>
        {{ t('terminal.new') }}
      </NTooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 终端标签栏：选择、拖拽排序、重命名与关闭确认。
 */

import { NButton, NInput, NPopconfirm, NTooltip, tooltipDark } from 'naive-ui';
import type { TerminalSessionPublic } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import { VueDraggable } from 'vue-draggable-plus';
import AppIcon from '@/components/AppIcon.vue';
import { terminalPopconfirmThemeOverrides, terminalTooltipThemeOverrides } from '../terminal-theme';

defineProps<{
  tabs: TerminalSessionPublic[];
  activeId?: string | undefined;
  sessionId?: string | undefined;
  renamingId?: string | undefined;
  renameDraft: string;
  confirmTabId?: string | undefined;
  pendingBusyCount: number;
}>();

const emit = defineEmits<{
  select: [id: string];
  contextmenu: [event: MouseEvent, tab: TerminalSessionPublic];
  'start-rename': [tab: TerminalSessionPublic];
  'commit-rename': [];
  'cancel-rename': [];
  'update:rename-draft': [value: string];
  'request-close': [ids: string[], anchorId: string];
  'confirm-close': [];
  'cancel-close': [];
  'update-order': [tabs: TerminalSessionPublic[]];
  create: [];
  'create-directory': [];
}>();
</script>

<style scoped lang="less">
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
</style>
