<template>
  <div v-if="commands.length" class="nh-plugin-extras">
    <h4>{{ t('plugins.commands') }}</h4>
    <div class="nh-plugin-extras__list">
      <NButton
        v-for="command in commands"
        :key="command.id"
        size="small"
        secondary
        @click="runCommand(command.id)"
      >
        {{ command.title }}
        <span v-if="command.shortcut" class="nh-plugin-extras__shortcut">{{
          command.shortcut
        }}</span>
      </NButton>
    </div>
  </div>

  <div v-if="views.length" class="nh-plugin-extras">
    <h4>{{ t('plugins.views') }}</h4>
    <div class="nh-plugin-extras__list">
      <NButton
        v-for="view in views"
        :key="view.id"
        size="small"
        secondary
        @click="selectedView = view"
      >
        {{ view.title }} · {{ view.location }}
      </NButton>
    </div>
  </div>

  <NModal
    :show="Boolean(selectedView)"
    preset="card"
    :title="selectedView?.title ?? ''"
    :bordered="false"
    style="width: min(720px, calc(100vw - 48px))"
    @update:show="
      (value) => {
        if (!value) selectedView = null;
      }
    "
  >
    <PluginViewHost :view="selectedView" />
  </NModal>
</template>

<script setup lang="ts">
/**
 * 插件命令与视图入口，以及视图弹窗。
 */

import { ref } from 'vue';
import { NButton, NModal } from 'naive-ui';
import { t } from '@/app/i18n';
import { usePluginRuntimeStore, type PluginCommand, type PluginView } from '../runtime.store';
import PluginViewHost from './PluginViewHost.vue';

defineProps<{ commands: PluginCommand[]; views: PluginView[] }>();
const runtime = usePluginRuntimeStore();
const selectedView = ref<PluginView | null>(null);

const runCommand = (id: string): void => {
  const command = runtime.commands.get(id);
  if (!command) return;
  Promise.resolve(command.handler()).catch((reason: unknown) => {
    runtime.error = reason instanceof Error ? reason.message : String(reason);
  });
};
</script>

<style scoped lang="less">
.nh-plugin-extras {
  margin-top: 16px;
}

.nh-plugin-extras h4 {
  margin: 0 0 8px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.nh-plugin-extras__list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
