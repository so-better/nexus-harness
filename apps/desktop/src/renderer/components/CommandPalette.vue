<template>
  <NModal
    :show="show"
    preset="card"
    class="nh-command-palette-modal"
    :title="t('commands.title')"
    :bordered="false"
    :mask-closable="true"
    :auto-focus="false"
    style="width: min(620px, calc(100vw - 48px))"
    @update:show="emit('update:show', $event)"
  >
    <div class="nh-command-palette">
      <NInput
        ref="input"
        v-model:value="query"
        class="nh-command-palette__search"
        size="large"
        clearable
        :placeholder="t('commands.placeholder')"
        :aria-label="t('commands.placeholder')"
        @keydown="onKeydown"
      >
        <template #prefix><AppIcon name="search" :size="17" /></template>
      </NInput>

      <div ref="list" class="nh-command-palette__list" role="listbox">
        <section v-for="group in groups" :key="group.label" class="nh-command-palette__group">
          <p class="nh-command-palette__group-label">{{ group.label }}</p>
          <button
            v-for="entry in group.items"
            :key="entry.command.id"
            :id="`command-option-${entry.index}`"
            :data-command-index="entry.index"
            type="button"
            role="option"
            class="nh-command-palette__item"
            :class="{ 'nh-command-palette__item--active': entry.index === activeIndex }"
            :aria-selected="entry.index === activeIndex"
            @mouseenter="activeIndex = entry.index"
            @click="execute(entry.command.id)"
          >
            <span class="nh-command-palette__icon">
              <AppIcon :name="entry.command.icon ?? 'spark'" :size="16" />
            </span>
            <span class="nh-command-palette__main">
              <span class="nh-command-palette__title">{{ entry.command.title }}</span>
              <span class="nh-command-palette__source">{{ entry.command.source }}</span>
            </span>
            <span
              v-if="entry.command.shortcut"
              class="nh-command-palette__shortcut"
              :aria-label="entry.command.shortcut"
            >
              <kbd
                v-for="(part, partIndex) in shortcutKeys(entry.command.shortcut)"
                :key="`${entry.command.id}-${partIndex}`"
                >{{ part }}</kbd
              >
            </span>
          </button>
        </section>
        <NEmpty v-if="filtered.length === 0" size="small" :description="t('commands.empty')" />
      </div>

      <footer class="nh-command-palette__footer">
        <span><kbd>↑</kbd><kbd>↓</kbd>{{ t('commands.hintNavigate') }}</span>
        <span><kbd>↵</kbd>{{ t('commands.hintSelect') }}</span>
        <span><kbd>Esc</kbd>{{ t('commands.hintClose') }}</span>
      </footer>
    </div>
  </NModal>
</template>

<script setup lang="ts">
/**
 * 命令面板：按分组搜索命令、插件入口与最近会话，支持键盘快速执行。
 */

import { computed, nextTick, ref, watch } from 'vue';
import { NEmpty, NInput, NModal, type InputInst } from 'naive-ui';
import { t } from '@/app/i18n';
import type { PaletteCommand } from '@/app/commands';
import AppIcon from './AppIcon.vue';

const props = defineProps<{ show: boolean; commands: PaletteCommand[] }>();
const emit = defineEmits<{ 'update:show': [show: boolean]; select: [id: string] }>();

const input = ref<InputInst | null>(null);
const list = ref<HTMLElement | null>(null);
const query = ref('');
const activeIndex = ref(0);
const isMac = navigator.userAgent.includes('Mac');

const filtered = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  if (!keyword) return props.commands;
  return props.commands.filter(
    (command) =>
      command.title.toLowerCase().includes(keyword) ||
      command.id.toLowerCase().includes(keyword) ||
      command.source.toLowerCase().includes(keyword)
  );
});

const groups = computed(() => {
  const bySource = new Map<string, PaletteCommand[]>();
  for (const command of filtered.value) {
    const items = bySource.get(command.source) ?? [];
    items.push(command);
    bySource.set(command.source, items);
  }
  return [...bySource.entries()].map(([label, commands]) => ({
    label,
    items: commands.map((command) => ({
      command,
      index: filtered.value.indexOf(command)
    }))
  }));
});

/**
 * 把 CmdOrCtrl+K 之类的声明拆成平台相关的键帽，便于快速扫读。
 */
const shortcutKeys = (shortcut: string): string[] => {
  const tokens = shortcut.split('+').map((token) => token.trim()).filter(Boolean);
  return tokens.map((token, index) => {
    if (index === tokens.length - 1) return token.length === 1 ? token.toUpperCase() : token;
    if (token === 'CmdOrCtrl' || token === 'Mod') return isMac ? '⌘' : 'Ctrl';
    if (token === 'Cmd' || token === 'Command') return isMac ? '⌘' : 'Ctrl';
    if (token === 'Ctrl' || token === 'Control') return isMac ? '⌃' : 'Ctrl';
    if (token === 'Shift') return isMac ? '⇧' : 'Shift';
    if (token === 'Alt' || token === 'Option') return isMac ? '⌥' : 'Alt';
    return token;
  });
};

watch(
  () => props.show,
  async (show) => {
    if (!show) {
      query.value = '';
      activeIndex.value = 0;
      return;
    }
    await nextTick();
    input.value?.focus();
    activeIndex.value = 0;
  }
);

watch(query, () => {
  activeIndex.value = 0;
});

watch(activeIndex, async () => {
  await nextTick();
  list.value
    ?.querySelector<HTMLElement>(`[data-command-index="${activeIndex.value}"]`)
    ?.scrollIntoView({ block: 'nearest' });
});

watch(filtered, (commands) => {
  if (activeIndex.value >= commands.length) activeIndex.value = Math.max(0, commands.length - 1);
});

const execute = (id: string): void => {
  emit('update:show', false);
  emit('select', id);
};

const onKeydown = (event: KeyboardEvent): void => {
  if (event.isComposing) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('update:show', false);
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (filtered.value.length) {
      activeIndex.value = (activeIndex.value + 1) % filtered.value.length;
    }
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (filtered.value.length) {
      activeIndex.value =
        (activeIndex.value - 1 + filtered.value.length) % filtered.value.length;
    }
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const command = filtered.value[activeIndex.value];
    if (command) execute(command.id);
  }
};
</script>

<style scoped lang="less">
.nh-command-palette {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.nh-command-palette__search :deep(.n-input-wrapper) {
  padding-inline: 4px;
}

.nh-command-palette__list {
  display: flex;
  max-height: min(55vh, 440px);
  flex-direction: column;
  gap: 10px;
  overflow: auto;
  padding: 2px 2px 4px;
}

.nh-command-palette__group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nh-command-palette__group-label {
  margin: 4px 10px 3px;
  color: var(--nh-color-text-disabled);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.nh-command-palette__item {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--nh-color-text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background var(--nh-duration-fast) var(--nh-ease-standard),
    border-color var(--nh-duration-fast) var(--nh-ease-standard);
}

.nh-command-palette__item:hover,
.nh-command-palette__item--active {
  border-color: color-mix(in srgb, var(--nh-color-accent) 22%, var(--nh-border-subtle));
  background: color-mix(in srgb, var(--nh-color-accent) 8%, var(--nh-color-bg-base));
}

.nh-command-palette__icon {
  display: grid;
  width: 28px;
  height: 28px;
  flex: none;
  place-items: center;
  border-radius: 8px;
  background: var(--nh-color-bg-hover);
  color: var(--nh-color-text-secondary);
}

.nh-command-palette__item--active .nh-command-palette__icon {
  background: color-mix(in srgb, var(--nh-color-accent) 15%, transparent);
  color: var(--nh-color-accent);
}

.nh-command-palette__main {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 1px;
}

.nh-command-palette__title {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-command-palette__source {
  overflow: hidden;
  color: var(--nh-color-text-secondary);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-command-palette__shortcut {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 3px;
  color: var(--nh-color-text-secondary);
  font-family: var(--nh-font-mono);
  font-size: 10px;
}

.nh-command-palette__shortcut kbd {
  display: inline-grid;
  min-width: 20px;
  height: 21px;
  padding: 0 5px;
  place-items: center;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 5px;
  background: var(--nh-color-bg-elevated);
  box-shadow: 0 1px 0 color-mix(in srgb, var(--nh-border-subtle) 70%, transparent);
  font-family: inherit;
  font-size: 10px;
  line-height: 1;
}

.nh-command-palette__footer kbd {
  display: inline-grid;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  place-items: center;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 4px;
  background: var(--nh-color-bg-elevated);
  color: var(--nh-color-text-secondary);
  font-family: var(--nh-font-mono);
  font-size: 9px;
}

.nh-command-palette__item--active .nh-command-palette__shortcut kbd {
  border-color: color-mix(in srgb, var(--nh-color-accent) 28%, var(--nh-border-subtle));
  color: var(--nh-color-text-primary);
}

.nh-command-palette__footer {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  padding-top: 10px;
  border-top: 1px solid var(--nh-border-subtle);
  color: var(--nh-color-text-disabled);
  font-size: 10px;
}

.nh-command-palette__footer span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
</style>
