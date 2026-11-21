<template>
  <div
    v-if="menu"
    class="nh-terminal-menu-mask"
    @mousedown="emit('close')"
    @contextmenu.prevent="emit('close')"
  />
  <div
    v-if="menu"
    ref="menuRef"
    class="nh-terminal-menu"
    :style="menuStyle"
    role="menu"
    @mousedown.stop
    @keydown.esc.prevent="emit('close')"
    @keydown.down.prevent="focusItem(1)"
    @keydown.up.prevent="focusItem(-1)"
  >
    <template v-for="item in items" :key="item.key">
      <div v-if="item.divider" class="nh-terminal-menu__divider" />
      <button
        v-else
        type="button"
        class="nh-terminal-menu__item"
        :class="{ 'nh-terminal-menu__item--danger': item.danger }"
        :disabled="item.disabled"
        @click.stop="emit('select', item.key)"
      >
        {{ item.label }}
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 终端右键菜单：固定定位、遮罩、键盘导航与动作回传。
 */

import { nextTick, onMounted, ref, watch, type CSSProperties } from 'vue';
import type { TerminalMenuState, TerminalMenuItem } from '../terminal-menu';

const props = defineProps<{
  menu?: TerminalMenuState | undefined;
  items: TerminalMenuItem[];
  menuStyle: CSSProperties | Record<string, never>;
}>();

const emit = defineEmits<{ close: []; select: [key: string] }>();
const menuRef = ref<HTMLElement>();

const focusFirstItem = (): void => {
  menuRef.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
};

const focusItem = (direction: number): void => {
  const items = [
    ...(menuRef.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
  ];
  if (!items.length) return;
  const current = items.indexOf(document.activeElement as HTMLButtonElement);
  const next = (current + direction + items.length) % items.length;
  items[next]?.focus();
};

onMounted(focusFirstItem);
watch(
  () => props.menu,
  () => nextTick(focusFirstItem)
);
</script>

<style scoped lang="less">
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
</style>
