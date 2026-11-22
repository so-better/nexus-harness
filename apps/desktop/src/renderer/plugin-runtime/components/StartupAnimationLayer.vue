<template>
  <div v-show="visible" class="nh-startup" @click="finish">
    <div ref="host" class="nh-startup__stage" />
  </div>
</template>

<script setup lang="ts">
/**
 * 启动动画宿主层：只提供全屏隔离容器、超时与跳过能力，视觉由启动动画插件绘制。
 */

import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { usePluginRuntimeStore } from '../runtime.store';

const DEFAULT_STARTUP_TIMEOUT_MS = 2_500;
const MAX_STARTUP_TIMEOUT_MS = 10_000;

const runtime = usePluginRuntimeStore();
const host = ref<HTMLElement>();
const visible = ref(false);
let shadowRoot: ShadowRoot | undefined;
let cleanup: (() => void) | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let mounting = false;
let finished = false;

/**
 * 结束启动动画并释放插件资源；重复调用保持幂等。
 */
const finish = (): void => {
  finished = true;
  if (timer) {
    clearTimeout(timer);
    timer = undefined;
  }
  const dispose = cleanup;
  cleanup = undefined;
  try {
    dispose?.();
  } catch (reason) {
    console.error('启动动画清理失败', reason);
  }
  shadowRoot?.replaceChildren();
  visible.value = false;
};

/**
 * 挂载当前注册的启动动画；插件通过第三个参数通知宿主动画结束。
 */
const mountAnimation = async (): Promise<boolean> => {
  const implementation = runtime.activeStartupMount;
  const element = host.value;
  if (finished || !implementation || !element) return false;

  if (!shadowRoot) shadowRoot = element.attachShadow({ mode: 'open' });
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.inset = '0';
  container.style.overflow = 'hidden';
  shadowRoot.replaceChildren(container);
  visible.value = true;
  await nextTick();
  // 等待下一帧期间可能被用户点击跳过或组件卸载，不能再挂载动画
  if (finished) return true;

  try {
    const dispose = implementation.mount(container, implementation.context, finish);
    if (finished) {
      dispose();
      return true;
    }
    cleanup = dispose;
    const duration = Math.min(
      implementation.durationMs ?? DEFAULT_STARTUP_TIMEOUT_MS,
      MAX_STARTUP_TIMEOUT_MS
    );
    timer = setTimeout(finish, duration);
    return true;
  } catch (reason) {
    runtime.reportPluginFailure(implementation.pluginId, reason);
    finish();
    return false;
  }
};

/**
 * 等待插件运行时完成初始化并启动启动动画；没有贡献点时直接结束。
 */
const start = async (): Promise<void> => {
  if (finished || mounting) return;
  mounting = true;
  try {
    await runtime.init();
    await runtime.activateForStartup();
    if (finished) return;
    const mounted = await mountAnimation();
    if (!mounted && !runtime.activeStartupMount) finished = true;
  } finally {
    mounting = false;
  }
};

watch(
  () => runtime.version,
  () => {
    if (!finished) start().catch((reason: unknown) => console.error('启动动画失败', reason));
  },
  { flush: 'post' }
);

onMounted(() => {
  start().catch((reason: unknown) => console.error('启动动画失败', reason));
});

onBeforeUnmount(() => {
  finish();
});
</script>

<style scoped lang="less">
.nh-startup {
  position: fixed;
  z-index: 1000;
  inset: 0;
  overflow: hidden;
  background: var(--nh-color-bg-base);
}

.nh-startup__stage {
  position: absolute;
  inset: 0;
}
</style>
