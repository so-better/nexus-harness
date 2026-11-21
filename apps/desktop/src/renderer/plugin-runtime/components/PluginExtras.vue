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
</template>

<script setup lang="ts">
/**
 * 插件命令入口；视图由插件自行选择入口并通过 ctx.views.open 打开。
 */

import { NButton } from 'naive-ui';
import { t } from '@/app/i18n';
import { usePluginRuntimeStore, type PluginCommand } from '../runtime.store';

defineProps<{ commands: PluginCommand[] }>();
const runtime = usePluginRuntimeStore();

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
