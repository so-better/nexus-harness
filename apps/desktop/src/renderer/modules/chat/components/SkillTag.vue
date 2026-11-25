<template>
  <span class="nh-skill-tag" :title="title" :aria-label="`${t('chat.skillLabel')} /${id}`">
    <AppIcon name="spark" :size="12" />
    <span class="nh-skill-tag__id">{{ id }}</span>
    <button
      v-if="removable"
      type="button"
      class="nh-skill-tag__remove"
      :aria-label="t('chat.skillRemove')"
      @click.stop="emit('remove')"
    >
      <AppIcon name="close" :size="10" />
    </button>
  </span>
</template>

<script setup lang="ts">
/**
 * Skill 标签：输入区与用户消息共用，展示紧凑的 skill-id 主题色标识。
 */
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';

defineProps<{
  id: string;
  title?: string | undefined;
  removable?: boolean;
}>();
const emit = defineEmits<{ remove: [] }>();
</script>

<style scoped lang="less">
.nh-skill-tag {
  --nh-skill-tag-accent: var(--nh-color-accent);

  display: inline-flex;
  width: fit-content;
  max-width: min(100%, 260px);
  flex: none;
  align-items: center;
  gap: 6px;
  padding: 2px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--nh-skill-tag-accent) 14%, transparent);
  color: var(--nh-skill-tag-accent);
  font-family: var(--nh-font-sans);
  font-weight: 500;
  font-size: 12px;
  line-height: 1.5;
}

.nh-skill-tag__id {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-skill-tag__remove {
  display: grid;
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: currentcolor;
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--nh-duration-fast) var(--nh-ease-standard);
}

.nh-skill-tag__remove:hover {
  background: color-mix(in srgb, var(--nh-color-danger) 16%, transparent);
  color: var(--nh-color-danger);
}

.nh-skill-tag__remove:focus-visible {
  opacity: 1;
}

.nh-skill-tag:hover .nh-skill-tag__remove {
  opacity: 1;
}
</style>
