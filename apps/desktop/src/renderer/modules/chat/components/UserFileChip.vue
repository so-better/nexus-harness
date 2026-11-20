<template>
  <span class="nh-user-file" :title="tooltip ?? file.path">
    <span class="nh-user-file__icon">
      <AppIcon name="file" :size="13" />
    </span>
    <span class="nh-user-file__name">{{ file.name }}</span>
    <button
      v-if="removable"
      type="button"
      class="nh-user-file__remove"
      :aria-label="t('chat.fileReferenceRemove')"
      @click.stop="emit('remove')"
    >
      <AppIcon name="close" :size="11" />
    </button>
  </span>
</template>

<script setup lang="ts">
/**
 * 用户消息文件引用 chip：图标底片、文件名与可选移除按钮。
 */

import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';

defineProps<{
  file: { path: string; name: string };
  removable?: boolean;
  tooltip?: string;
}>();
const emit = defineEmits<{ remove: [] }>();
</script>

<style scoped lang="less">
.nh-user-file {
  display: inline-flex;
  height: 30px;
  max-width: 260px;
  align-items: center;
  gap: 7px;
  padding: 0 9px 0 4px;
  border: 1px solid color-mix(in srgb, var(--nh-color-border) 80%, transparent);
  border-radius: 8px;
  background: var(--nh-surface-elevated);
  color: var(--nh-color-text-primary);
  font-size: 12px;
  transition:
    background var(--nh-duration-fast) var(--nh-ease-standard),
    border-color var(--nh-duration-fast) var(--nh-ease-standard);
}

.nh-user-file:hover {
  border-color: color-mix(in srgb, var(--nh-color-accent) 30%, var(--nh-border-subtle));
  background: var(--nh-color-bg-hover);
}

.nh-user-file__icon {
  display: grid;
  width: 22px;
  height: 22px;
  flex: none;
  place-items: center;
  border-radius: 6px;
  background: color-mix(in srgb, var(--nh-color-accent) 9%, transparent);
  color: var(--nh-color-accent);
}

.nh-user-file__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-user-file__remove {
  display: grid;
  width: 16px;
  height: 16px;
  flex: none;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--nh-color-text-secondary);
  cursor: pointer;
}

.nh-user-file__remove:hover {
  background: color-mix(in srgb, var(--nh-color-danger) 12%, transparent);
  color: var(--nh-color-danger);
}
</style>
