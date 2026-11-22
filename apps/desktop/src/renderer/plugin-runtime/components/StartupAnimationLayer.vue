<template>
  <div
    v-show="visible"
    ref="overlay"
    class="nh-startup"
    role="dialog"
    aria-modal="true"
    :aria-label="t('startup.label')"
    tabindex="-1"
    @click="finish"
    @keydown.esc.prevent="finish"
  >
    <div ref="host" class="nh-startup__stage" />
    <button type="button" class="nh-startup__skip" @click.stop="finish">
      {{ t('startup.skip') }}
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * 启动动画宿主层：只提供全屏隔离容器与跳过能力，视觉与时长由启动动画插件控制。
 */

import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { t } from '@/app/i18n';
import { usePluginRuntimeStore } from '../runtime.store';

const runtime = usePluginRuntimeStore();
const host = ref<HTMLElement>();
const overlay = ref<HTMLElement>();
const visible = ref(false);
let previousFocus: HTMLElement | null = null;
let shadowRoot: ShadowRoot | undefined;
let cleanup: (() => void) | undefined;
let mounting = false;
let started = false;
let finished = false;

/**
 * 结束启动动画并释放插件资源；重复调用保持幂等。
 */
const finish = (): void => {
  finished = true;
  const dispose = cleanup;
  cleanup = undefined;
  try {
    dispose?.();
  } catch (reason) {
    console.error('启动动画清理失败', reason);
  }
  shadowRoot?.replaceChildren();
  visible.value = false;
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  previousFocus = null;
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
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  overlay.value?.focus({ preventScroll: true });

  try {
    const dispose = implementation.mount(container, implementation.context, finish);
    if (finished) {
      dispose();
      return true;
    }
    cleanup = dispose;
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
  if (finished || mounting || started) return;
  mounting = true;
  try {
    await runtime.init();
    await runtime.activateForStartup();
    if (finished) return;
    started = await mountAnimation();
    if (!started && !runtime.activeStartupMount) finished = true;
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

.nh-startup__skip {
  position: absolute;
  right: 24px;
  bottom: 22px;
  padding: 6px 10px;
  border: 1px solid color-mix(in srgb, var(--nh-color-border) 72%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--nh-color-bg-base) 42%, transparent);
  color: var(--nh-color-text-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  backdrop-filter: blur(12px);
}

.nh-startup__skip:hover {
  background: color-mix(in srgb, var(--nh-color-bg-base) 64%, transparent);
  color: var(--nh-color-text-primary);
}

.nh-startup__skip:focus-visible {
  outline: 2px solid var(--nh-color-accent);
  outline-offset: 2px;
}
</style>
