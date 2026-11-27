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
    root.value.appendChild(host);
    const context = { ...props.context, location: props.location };
    // shadow:false 的插件直接挂普通 DOM，让其 UI 库的全局样式与浮层生效
    if (contribution.shadow === false) {
      try {
        const cleanup = contribution.mount(host, context);
        if (typeof cleanup === 'function') cleanups.push(cleanup);
      } catch (reason) {
        host.remove();
        runtime.reportPluginFailure(contribution.pluginId, reason);
      }
      continue;
    }
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent =
      ':host{display:block;font:inherit;color:inherit}:host *{box-sizing:border-box}';
    shadow.appendChild(style);
    const container = document.createElement('div');
    shadow.appendChild(container);
    try {
      const cleanup = contribution.mount(container, context);
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

/**
 * 上下文签名：用显式字段拼接，只随内容变化（如 usage 更新）而变。
 * 避免父组件每次重渲染（引用变化）或对象键顺序变化导致“假变更”而重挂载插槽。
 */
const contextSignature = (): string => {
  const context = props.context;
  const usage = context.usage;
  return [
    runtime.version,
    props.location,
    context.sessionId ?? '',
    context.runId ?? '',
    context.messageId ?? '',
    context.role ?? '',
    context.toolCallId ?? '',
    context.approvalId ?? '',
    context.fileId ?? '',
    context.model ?? '',
    context.durationMs ?? '',
    context.contentChars ?? '',
    usage
      ? `${usage.inputTokens}/${usage.outputTokens}/${usage.cacheReadTokens ?? ''}/${usage.cacheWriteTokens ?? ''}/${usage.cost ?? ''}`
      : ''
  ].join('::');
};

let frameId: number | undefined;
let disposed = false;
const schedule = (): void => {
  // 合并同一帧内的多次变化，只重挂载一次；卸载后不再触发
  if (disposed || frameId !== undefined) return;
  frameId = requestAnimationFrame(() => {
    frameId = undefined;
    if (disposed) return;
    activate().catch(() => undefined);
  });
};

onMounted(() => {
  activate().catch(() => undefined);
});

watch(contextSignature, schedule);

onBeforeUnmount(() => {
  disposed = true;
  if (frameId !== undefined) {
    cancelAnimationFrame(frameId);
    frameId = undefined;
  }
  clear();
});
</script>

<style scoped lang="less">
.nh-plugin-slot {
  display: contents;
}

.nh-plugin-slot :deep(.nh-plugin-slot__item) {
  display: contents;
}
</style>
