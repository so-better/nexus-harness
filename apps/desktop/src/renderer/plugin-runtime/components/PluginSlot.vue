<template>
  <div ref="root" class="nh-plugin-slot" />
</template>

<script setup lang="ts">
/**
 * 插件插槽：在 Shadow DOM 中挂载贡献，隔离插件样式并跟随主题变量。
 */

import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { usePluginRuntimeStore } from '../runtime.store';
import { slotRegistry, type SlotContext, type SlotLocation } from '../slot-registry';

const props = defineProps<{ location: SlotLocation; context: SlotContext }>();
const runtime = usePluginRuntimeStore();
const root = ref<HTMLElement>();
let cleanups: Array<() => void> = [];

const clear = (): void => {
  for (const cleanup of cleanups) {
    try {
      cleanup();
    } catch {
      // 插件清理失败不能影响其他插槽
    }
  }
  cleanups = [];
  if (root.value) root.value.innerHTML = '';
};

const render = (): void => {
  clear();
  if (!root.value) return;
  for (const contribution of slotRegistry.list(props.location)) {
    const host = document.createElement('div');
    host.className = 'nh-plugin-slot__item';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent =
      ':host{display:block;font:inherit;color:inherit}:host *{box-sizing:border-box}';
    shadow.appendChild(style);
    const container = document.createElement('div');
    shadow.appendChild(container);
    root.value.appendChild(host);
    try {
      const cleanup = contribution.mount(container, {
        ...props.context,
        location: props.location
      });
      if (typeof cleanup === 'function') cleanups.push(cleanup);
    } catch (reason) {
      host.remove();
      runtime.reportPluginFailure(contribution.pluginId, reason);
    }
  }
};

const activate = async (): Promise<void> => {
  await runtime.activateForSlot(props.location);
  render();
};

onMounted(() => {
  activate().catch(() => undefined);
});

watch(
  () => [runtime.version, props.context] as const,
  () => {
    activate().catch(() => undefined);
  },
  { deep: true }
);

onBeforeUnmount(clear);
</script>

<style scoped lang="less">
.nh-plugin-slot {
  display: contents;
}

.nh-plugin-slot :deep(.nh-plugin-slot__item) {
  display: contents;
}
</style>
