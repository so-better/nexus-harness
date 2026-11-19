<template>
  <div v-show="skin" ref="host" class="nh-plugin-skin" aria-hidden="true" />
</template>

<script setup lang="ts">
/**
 * 插件全局皮肤背景层：由插件 renderer 入口绘制背景，宿主只提供隔离容器。
 */

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { usePluginRuntimeStore } from '../runtime.store';

const pluginRuntime = usePluginRuntimeStore();
const host = ref<HTMLElement>();
const skin = computed(() => pluginRuntime.activeSkin);
let shadowRoot: ShadowRoot | undefined;
let cleanup: (() => void) | undefined;

/**
 * 清理上一份皮肤实现，切换皮肤或插件停用时必须释放动画、监听器与 DOM。
 */
const unmountSkin = (): void => {
  cleanup?.();
  cleanup = undefined;
  shadowRoot?.replaceChildren();
};

/**
 * 在当前选中皮肤的实现已注册后挂载插件代码。
 * 插件自行决定使用图片、canvas、WebGL 或其他 DOM。
 */
const mountSkin = (): void => {
  unmountSkin();
  const implementation = pluginRuntime.activeSkinMount;
  const element = host.value;
  if (!implementation || !element) return;
  if (!shadowRoot) shadowRoot = element.attachShadow({ mode: 'open' });
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.inset = '0';
  container.style.overflow = 'hidden';
  shadowRoot.replaceChildren(container);
  try {
    cleanup = implementation.mount(container, implementation.context);
  } catch (reason) {
    pluginRuntime.reportPluginFailure(implementation.pluginId, reason);
  }
};

/**
 * 皮肤插件按需激活；选中皮肤后注册实现会触发 activeSkinMount 更新。
 */
const ensureSkin = async (): Promise<void> => {
  if (pluginRuntime.activeSkin && !pluginRuntime.activeSkinMount) {
    await pluginRuntime.activateForSkins();
  }
  mountSkin();
};

onMounted(() => {
  ensureSkin().catch((reason: unknown) => console.error('皮肤插件激活失败', reason));
});

watch(
  () => [pluginRuntime.activeSkin, pluginRuntime.activeSkinMount],
  () => {
    ensureSkin().catch((reason: unknown) => console.error('皮肤插件激活失败', reason));
  },
  { flush: 'post' }
);

onBeforeUnmount(unmountSkin);
</script>

<style scoped lang="less">
.nh-plugin-skin {
  position: fixed;
  z-index: 0;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
</style>
