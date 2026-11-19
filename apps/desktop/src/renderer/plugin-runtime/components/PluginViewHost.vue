<template>
  <div ref="root" class="nh-plugin-view-host" />
</template>

<script setup lang="ts">
/**
 * 插件视图宿主：在 Shadow DOM 中挂载 side/main/bottom 视图。
 */

import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { usePluginRuntimeStore, type PluginView } from '../runtime.store';

const props = defineProps<{ view: PluginView | null }>();
const runtime = usePluginRuntimeStore();
const root = ref<HTMLElement>();
let cleanup: (() => void) | undefined;

const clear = (): void => {
  cleanup?.();
  cleanup = undefined;
  if (root.value) root.value.innerHTML = '';
};

const mount = (): void => {
  clear();
  if (!root.value || !props.view) return;
  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent =
    ':host{display:block;color:inherit;font:inherit}:host *{box-sizing:border-box}';
  shadow.appendChild(style);
  const container = document.createElement('div');
  shadow.appendChild(container);
  root.value.appendChild(host);
  try {
    cleanup = props.view.mount(container, props.view.context);
  } catch (reason) {
    host.remove();
    runtime.reportPluginFailure(props.view.pluginId, reason);
  }
};

onMounted(mount);
watch(() => props.view, mount);
onBeforeUnmount(clear);
</script>

<style scoped lang="less">
.nh-plugin-view-host {
  min-height: 120px;
}
</style>
