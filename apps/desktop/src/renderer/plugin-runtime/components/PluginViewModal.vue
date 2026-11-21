<template>
  <NModal
    :show="Boolean(runtime.openedView)"
    preset="card"
    :title="runtime.openedView?.title ?? ''"
    :bordered="false"
    class="nh-plugin-view-modal"
    style="width: min(1120px, calc(100vw - 48px))"
    @update:show="
      (value) => {
        if (!value) runtime.closeView();
      }
    "
  >
    <PluginViewHost v-if="runtime.openedView" :view="runtime.openedView" />
  </NModal>
</template>

<script setup lang="ts">
/**
 * 宿主级插件视图弹窗：由插件通过 ctx.views.open 或命令打开完整视图。
 */

import { NModal } from 'naive-ui';
import { usePluginRuntimeStore } from '../runtime.store';
import PluginViewHost from './PluginViewHost.vue';

const runtime = usePluginRuntimeStore();
</script>

<style scoped lang="less">
.nh-plugin-view-modal :deep(.n-card) {
  overflow: hidden;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 14px;
  box-shadow: var(--nh-shadow-float);
}

.nh-plugin-view-modal :deep(.n-card-header) {
  padding: 18px 24px;
  border-bottom: 1px solid var(--nh-border-subtle);
  background: color-mix(in srgb, var(--nh-color-bg-elevated) 72%, transparent);
}

.nh-plugin-view-modal :deep(.n-card-header__main) {
  color: var(--nh-color-text-primary);
  font-size: 15px;
  font-weight: 600;
}

.nh-plugin-view-modal :deep(.n-card__content) {
  max-height: min(720px, calc(100vh - 180px));
  padding: 18px 24px 24px;
  overflow: auto;
  background: color-mix(in srgb, var(--nh-color-bg-base) 78%, transparent);
}
</style>
