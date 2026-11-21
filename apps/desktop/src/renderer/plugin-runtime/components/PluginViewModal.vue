<template>
  <NModal
    :show="Boolean(runtime.openedView)"
    preset="card"
    :title="runtime.openedView?.title ?? ''"
    :bordered="false"
    class="nh-plugin-view-modal"
    style="width: min(1080px, calc(100vw - 48px))"
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
.nh-plugin-view-modal :deep(.n-card__content) {
  max-height: min(720px, calc(100vh - 160px));
  overflow: auto;
}
</style>
