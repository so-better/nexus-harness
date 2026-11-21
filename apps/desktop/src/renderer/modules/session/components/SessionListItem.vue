<template>
  <div
    class="nh-session-item"
    :class="{
      'nh-session-item--active': active,
      'nh-session-item--actions-visible': menuOpen || deleteConfirmVisible
    }"
    role="button"
    tabindex="0"
    :title="session.title"
    :aria-current="active ? 'page' : undefined"
    @click="select"
    @keydown.enter="select"
    @keydown.space.prevent="select"
  >
    <span class="nh-session-item__icon">
      <AppIcon name="message" :size="15" />
    </span>

    <div class="nh-session-item__body">
      <div class="nh-session-item__title-row">
        <span v-if="!renaming" class="nh-session-item__title">{{ session.title }}</span>
        <span v-else class="nh-session-item__rename" @click.stop @keydown.stop>
          <NInput
            ref="renameInput"
            size="tiny"
            :value="draft"
            @update:value="(value: string) => (draft = value)"
            @keydown.enter.prevent="commitRename"
            @keydown.esc.prevent="cancelRename"
            @blur="commitRename"
          />
        </span>
        <AppIcon
          v-if="session.pinned && !renaming"
          class="nh-session-item__pin"
          name="pin"
          :size="12"
        />
      </div>
      <div v-if="!renaming" class="nh-session-item__meta">
        <span
          class="nh-session-item__status"
          :class="`nh-session-item__status--${sessionStatusTone(session.status)}`"
        >
          <span class="nh-session-item__status-dot" />
          {{ statusLabel }}
        </span>
        <span class="nh-session-item__separator">·</span>
        <span class="nh-session-item__time">{{ relativeTime }}</span>
      </div>
    </div>

    <div v-if="!renaming" class="nh-session-item__actions" @click.stop>
      <PluginSlot
        location="session.item.actions"
        :context="{ location: 'session.item.actions', sessionId: session.id }"
      />
      <NPopconfirm
        v-model:show="deleteConfirmVisible"
        trigger="manual"
        placement="right"
        @positive-click="emit('remove')"
      >
        <template #trigger>
          <span class="nh-session-item__more">
            <NDropdown
              trigger="click"
              placement="bottom-end"
              :options="menuOptions"
              :menu-props="dropdownMenuProps"
              scrollable
              @select="handleMenu"
              @update:show="menuOpen = $event"
            >
              <NButton
                text
                size="tiny"
                class="nh-session-item__action"
                :title="t('session.more')"
                :aria-label="t('session.more')"
                @click.stop
              >
                <template #icon>
                  <AppIcon name="more" :size="15" />
                </template>
              </NButton>
            </NDropdown>
          </span>
        </template>
        {{ t('session.deleteConfirm') }}
      </NPopconfirm>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 会话列表项：展示状态与相对时间，通过更多菜单执行置顶、重命名与删除。
 */

import { dropdownMenuProps } from '@/app/menu-props';
import { computed, h, nextTick, ref } from 'vue';
import {
  NButton,
  NDropdown,
  NInput,
  NPopconfirm,
  type DropdownOption,
  type InputInst
} from 'naive-ui';
import type { SessionSummary } from '@shared/ipc/contracts';
import { locale, t } from '@/app/i18n';
import { sessionStatusLabel, sessionStatusTone } from '@/app/session-status';
import AppIcon from '@/components/AppIcon.vue';
import PluginSlot from '@/plugin-runtime/components/PluginSlot.vue';

const props = defineProps<{
  session: SessionSummary;
  active: boolean;
}>();

const emit = defineEmits<{
  select: [];
  remove: [];
  rename: [title: string];
  'toggle-pin': [];
}>();

const menuOpen = ref(false);
const deleteConfirmVisible = ref(false);
const renaming = ref(false);
const draft = ref('');
const renameInput = ref<InputInst | null>(null);

const menuOptions = computed<DropdownOption[]>(() => [
  {
    key: 'pin',
    label: props.session.pinned ? t('session.unpin') : t('session.pin'),
    icon: () => h(AppIcon, { name: 'pin', size: 14 })
  },
  {
    key: 'rename',
    label: t('session.rename'),
    icon: () => h(AppIcon, { name: 'edit', size: 14 })
  },
  { type: 'divider', key: 'divider' },
  {
    key: 'delete',
    label: t('session.delete'),
    icon: () => h(AppIcon, { name: 'trash', size: 14 })
  }
]);

/**
 * 卡片选择；重命名中不切换会话。
 */
const select = (): void => {
  if (!renaming.value) emit('select');
};

/**
 * 处理更多菜单操作。
 */
const handleMenu = (key: string | number): void => {
  if (key === 'pin') emit('toggle-pin');
  if (key === 'rename') {
    startRename().catch((error: unknown) => {
      console.error('开始重命名失败', error);
    });
  }
  if (key === 'delete') deleteConfirmVisible.value = true;
};

/**
 * 进入行内重命名并聚焦输入框。
 */
const startRename = async (): Promise<void> => {
  draft.value = props.session.title;
  renaming.value = true;
  await nextTick();
  renameInput.value?.focus();
  renameInput.value?.select();
};

/**
 * 提交非空且发生变化的标题。
 */
const commitRename = (): void => {
  if (!renaming.value) return;
  renaming.value = false;
  const title = draft.value.trim();
  if (title && title !== props.session.title) emit('rename', title);
};

/**
 * 取消重命名并恢复原值。
 */
const cancelRename = (): void => {
  renaming.value = false;
  draft.value = props.session.title;
};

const statusLabel = computed(() => sessionStatusLabel(props.session.status));

/**
 * 最近活跃时间的相对展示；超过一周回退为短日期。
 */
const relativeTime = computed(() => {
  const diff = Math.max(0, Date.now() - props.session.lastActiveAt);
  if (diff < 60_000) return t('session.justNow');

  const formatter = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' });
  if (diff < 3_600_000) return formatter.format(-Math.round(diff / 60_000), 'minute');
  if (diff < 86_400_000) return formatter.format(-Math.round(diff / 3_600_000), 'hour');
  if (diff < 7 * 86_400_000) return formatter.format(-Math.round(diff / 86_400_000), 'day');

  return new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric' }).format(
    props.session.lastActiveAt
  );
});
</script>

<style scoped lang="less">
.nh-session-item {
  position: relative;
  display: flex;
  min-height: 64px;
  align-items: center;
  gap: 10px;
  padding: 11px 12px;
  border: 1px solid color-mix(in srgb, var(--nh-border-subtle) 82%, transparent);
  border-radius: 10px;
  background: var(--nh-surface-base);
  color: var(--nh-color-text-primary);
  cursor: pointer;
  text-align: left;
  transition:
    background var(--nh-duration-fast) var(--nh-ease-standard),
    border-color var(--nh-duration-fast) var(--nh-ease-standard);
}

.nh-session-item:hover {
  border-color: color-mix(in srgb, var(--nh-color-accent) 26%, var(--nh-border-subtle));
}

.nh-session-item--active {
  border-color: color-mix(in srgb, var(--nh-color-accent) 50%, var(--nh-border-subtle));
  background: color-mix(in srgb, var(--nh-color-accent) 16%, var(--nh-surface-base));
  box-shadow: var(--nh-highlight);
}

.nh-session-item__icon {
  display: grid;
  width: 28px;
  height: 28px;
  flex: none;
  place-items: center;
  border-radius: 7px;
  background: var(--nh-color-bg-hover);
  color: var(--nh-color-text-secondary);
}

.nh-session-item--active .nh-session-item__icon {
  background: color-mix(in srgb, var(--nh-color-accent) 12%, transparent);
  color: var(--nh-color-accent);
}

.nh-session-item__body {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  padding-right: 30px;
}

.nh-session-item__title-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 5px;
}

.nh-session-item__title {
  overflow: hidden;
  font-size: 14px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-session-item__rename {
  flex: 1;
  min-width: 0;
}

.nh-session-item__pin {
  flex: none;
  color: var(--nh-color-accent);
}

.nh-session-item__meta {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
}

.nh-session-item__status {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  white-space: nowrap;
}

.nh-session-item__status--default {
  color: var(--nh-color-idle);
}

.nh-session-item__status--info {
  color: var(--nh-color-accent);
}

.nh-session-item__status--warning {
  color: var(--nh-color-warning);
}

.nh-session-item__status--success {
  color: var(--nh-color-success);
}

.nh-session-item__status--error {
  color: var(--nh-color-danger);
}

.nh-session-item__status-dot {
  width: 5px;
  height: 5px;
  flex: none;
  border-radius: 50%;
  background: currentcolor;
}

.nh-session-item__separator,
.nh-session-item__time {
  color: var(--nh-color-text-disabled);
  font-size: 12px;
}

.nh-session-item__time {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-session-item__actions {
  position: absolute;
  top: 9px;
  right: 5px;
  display: flex;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--nh-duration-fast) var(--nh-ease-standard);
}

.nh-session-item--actions-visible .nh-session-item__actions,
.nh-session-item:hover .nh-session-item__actions,
.nh-session-item:focus-within .nh-session-item__actions {
  opacity: 1;
  pointer-events: auto;
}

.nh-session-item__more {
  display: inline-flex;
}

.nh-session-item__action {
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 6px;
  color: var(--nh-color-text-secondary);
}

.nh-session-item__action:hover {
  background: var(--nh-color-bg-hover);
  color: var(--nh-color-text-primary);
}
</style>
