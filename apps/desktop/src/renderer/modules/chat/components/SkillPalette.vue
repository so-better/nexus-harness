<template>
  <div ref="listRef" class="nh-skill-palette" role="listbox">
    <div class="nh-skill-palette__header">
      <span>{{ t('chat.skillTitle') }}</span>
      <span class="nh-skill-palette__count">{{ items.length }}</span>
    </div>
    <button
      v-for="(skill, index) in items"
      :key="skill.id"
      type="button"
      class="nh-skill-palette__item"
      :class="{ 'nh-skill-palette__item--active': index === activeIndex }"
      role="option"
      :aria-selected="index === activeIndex"
      @mouseenter="emit('hover', index)"
      @mousedown.prevent="emit('select', skill.id)"
    >
      <span class="nh-skill-palette__icon">
        <AppIcon name="spark" :size="14" />
      </span>
      <span class="nh-skill-palette__copy">
        <span class="nh-skill-palette__name">/{{ skill.id }}</span>
        <span class="nh-skill-palette__description">{{ skill.description }}</span>
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * 斜杠 Skill 候选列表：输入区与消息编辑共用。
 */

import { nextTick, ref, watch } from 'vue';
import type { SkillSummary } from '@shared/skills';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';

const props = defineProps<{ items: SkillSummary[]; activeIndex: number }>();
const emit = defineEmits<{ select: [id: string]; hover: [index: number] }>();

const listRef = ref<HTMLElement | null>(null);

watch(
  () => props.activeIndex,
  async () => {
    await nextTick();
    const buttons = listRef.value?.querySelectorAll<HTMLElement>('.nh-skill-palette__item');
    buttons?.[props.activeIndex]?.scrollIntoView({ block: 'nearest' });
  }
);
</script>

<style scoped lang="less">
.nh-skill-palette {
  display: flex;
  max-height: 280px;
  flex-direction: column;
  gap: 1px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 2px;
}

.nh-skill-palette__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 7px 6px;
  color: var(--nh-color-text-secondary);
  font-size: 11px;
}

.nh-skill-palette__count {
  color: var(--nh-color-text-disabled);
  font-family: var(--nh-font-mono);
  font-size: 10px;
}

.nh-skill-palette__item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 6px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--nh-color-text-primary);
  text-align: left;
  cursor: pointer;
  transition: background var(--nh-duration-fast) var(--nh-ease-standard);
}

.nh-skill-palette__item:hover {
  background: var(--nh-surface-hover);
}

.nh-skill-palette__item--active,
.nh-skill-palette__item--active:hover {
  background: color-mix(in srgb, var(--nh-color-accent) 10%, transparent);
}

.nh-skill-palette__icon {
  display: grid;
  width: 24px;
  height: 24px;
  flex: none;
  place-items: center;
  border-radius: 6px;
  background: var(--nh-surface-hover);
  color: var(--nh-color-text-secondary);
}

.nh-skill-palette__item--active .nh-skill-palette__icon {
  background: color-mix(in srgb, var(--nh-color-accent) 14%, transparent);
  color: var(--nh-color-accent);
}

.nh-skill-palette__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
}

.nh-skill-palette__name {
  overflow: hidden;
  font-family: var(--nh-font-mono);
  font-size: 12px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-skill-palette__description {
  overflow: hidden;
  color: var(--nh-color-text-secondary);
  font-size: 11px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
