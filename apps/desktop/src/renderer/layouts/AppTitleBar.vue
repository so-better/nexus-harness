<template>
  <header class="nh-titlebar" :class="{ 'nh-titlebar--mac': isMac }" @dblclick="toggleMaximize">
    <div class="nh-titlebar__title">
      <span class="nh-titlebar__brand">Nexus</span>
      <span v-if="title" class="nh-titlebar__separator">/</span>
      <span v-if="title" class="nh-titlebar__session">{{ title }}</span>
    </div>

    <div v-if="platform && !isMac" class="nh-titlebar__controls" @dblclick.stop>
      <button
        type="button"
        class="nh-titlebar__control"
        :aria-label="t('window.minimize')"
        :title="t('window.minimize')"
        @click="minimize"
      >
        <AppIcon name="minimize" :size="14" />
      </button>
      <button
        type="button"
        class="nh-titlebar__control"
        :aria-label="maximized ? t('window.restore') : t('window.maximize')"
        :title="maximized ? t('window.restore') : t('window.maximize')"
        @click="toggleMaximize"
      >
        <AppIcon :name="maximized ? 'restore' : 'maximize'" :size="13" />
      </button>
      <button
        type="button"
        class="nh-titlebar__control nh-titlebar__control--close"
        :aria-label="t('window.close')"
        :title="t('window.close')"
        @click="close"
      >
        <AppIcon name="close" :size="14" />
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
/**
 * 跨平台自定义标题栏：macOS 留出红绿灯空间，Windows 使用自绘窗口按钮。
 */

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import {
  closeWindow,
  isWindowMaximized,
  minimizeWindow,
  onWindowMaximizedChange,
  toggleMaximizeWindow
} from '@/app/window.api';

const props = defineProps<{
  title?: string | undefined;
  platform: string;
}>();

const platform = computed(() => props.platform);
const isMac = computed(() => platform.value === 'darwin');
const maximized = ref(false);
let unsubscribe: (() => void) | undefined;

const minimize = (): void => {
  void minimizeWindow();
};

const toggleMaximize = async (): Promise<void> => {
  maximized.value = await toggleMaximizeWindow();
};

const close = (): void => {
  void closeWindow();
};

onMounted(async () => {
  maximized.value = await isWindowMaximized().catch(() => false);
  unsubscribe = onWindowMaximizedChange((value) => {
    maximized.value = value;
  });
});

onBeforeUnmount(() => unsubscribe?.());
</script>

<style scoped lang="less">
.nh-titlebar {
  display: flex;
  box-sizing: border-box;
  height: 44px;
  flex: none;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 0 16px;
  line-height: 1;
  border-bottom: 1px solid color-mix(in srgb, var(--nh-border-subtle) 65%, transparent);
  background: var(--nh-surface-base);
  -webkit-app-region: drag;
  user-select: none;
}

.nh-titlebar--mac {
  padding-left: 82px;
}

.nh-titlebar__title {
  display: flex;
  height: 100%;
  min-width: 0;
  align-items: center;
  gap: 8px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-titlebar__brand {
  color: var(--nh-color-text-primary);
  font-weight: 600;
}

.nh-titlebar__separator {
  color: var(--nh-color-text-disabled);
}

.nh-titlebar__session {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-titlebar__controls {
  display: flex;
  height: 100%;
  align-items: stretch;
  -webkit-app-region: no-drag;
}

.nh-titlebar__control {
  display: grid;
  width: 46px;
  height: 100%;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--nh-color-text-secondary);
  cursor: pointer;
  transition:
    background var(--nh-duration-fast) var(--nh-ease-standard),
    color var(--nh-duration-fast) var(--nh-ease-standard);
}

.nh-titlebar__control:hover {
  background: var(--nh-color-bg-hover);
  color: var(--nh-color-text-primary);
}

.nh-titlebar__control--close:hover {
  background: color-mix(in srgb, var(--nh-color-danger) 16%, transparent);
  color: var(--nh-color-danger);
}

@media (prefers-reduced-motion: reduce) {
  .nh-titlebar__control {
    transition: none;
  }
}
</style>
