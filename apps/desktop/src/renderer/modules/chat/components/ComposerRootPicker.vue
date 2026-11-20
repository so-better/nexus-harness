<template>
  <div class="nh-workspace-picker">
    <NButton text @click="emit('choose-root')">
      <template #icon>
        <AppIcon :name="roots.length ? 'folder' : 'plus'" />
      </template>
      {{ label }}
    </NButton>
    <NTooltip v-if="roots[0]" placement="top">
      <template #trigger>
        <NPopconfirm @positive-click="emit('remove-root', roots[0].id)">
          <template #trigger>
            <NButton size="tiny" secondary :aria-label="t('app.leaveWorkspace')">
              <template #icon>
                <AppIcon name="close" :size="12" />
              </template>
            </NButton>
          </template>
          {{ t('app.confirmLeaveWorkspace') }}
        </NPopconfirm>
      </template>
      {{ t('app.leaveWorkspace') }}
    </NTooltip>
  </div>
</template>

<script setup lang="ts">
/**
 * 工作区入口：未选择时显示添加入口，已选择时显示目录名并可重新选择。
 */

import { computed } from 'vue';
import { NButton, NPopconfirm, NTooltip } from 'naive-ui';
import type { SessionRoot } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';

const props = defineProps<{ roots: SessionRoot[] }>();
const emit = defineEmits<{ 'choose-root': []; 'remove-root': [rootId: string] }>();

const rootName = (path: string): string => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
const label = computed(() =>
  props.roots[0]
    ? `${t('app.selectedWorkspace')}${rootName(props.roots[0].path)}`
    : t('app.addWorkspace')
);
</script>

<style scoped lang="less">
.nh-workspace-picker {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
