<template>
  <div class="nh-ask-question">
    <p class="nh-ask-question__text">
      {{ question.question }}
      <span v-if="question.required" class="nh-ask-question__required">*</span>
    </p>

    <div v-if="question.options?.length" class="nh-ask-question__options">
      <button
        v-for="option in question.options"
        :key="option.id"
        type="button"
        class="nh-ask-option"
        :class="{ 'nh-ask-option--selected': isSelected(option.id) }"
        :aria-pressed="isSelected(option.id)"
        @click="emit('toggle', option.id)"
      >
        <span class="nh-ask-option__indicator">
          <AppIcon v-if="isSelected(option.id)" name="check" :size="11" />
        </span>
        <span class="nh-ask-option__copy">
          <span class="nh-ask-option__label">{{ option.label }}</span>
          <span v-if="option.description" class="nh-ask-option__description">
            {{ option.description }}
          </span>
        </span>
      </button>
    </div>

    <NInput
      v-if="!question.options?.length || question.allowOther"
      class="nh-ask-question__input"
      :value="text"
      :placeholder="t('chat.askUserOther')"
      @update:value="emit('update:text', $event)"
      @keydown.enter.exact.prevent="emit('submit')"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * Ask User 单个问题：选项与自定义输入。
 */

import { NInput } from 'naive-ui';
import type { AskQuestion } from '@shared/ask-user';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';

const props = defineProps<{
  question: AskQuestion;
  selectedIds: string[];
  text: string;
}>();

const emit = defineEmits<{
  toggle: [optionId: string];
  'update:text': [text: string];
  submit: [];
}>();

/**
 * 判断当前选项是否已选。
 */
const isSelected = (optionId: string): boolean => props.selectedIds.includes(optionId);
</script>

<style scoped lang="less">
.nh-ask-question {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.nh-ask-question__text {
  margin: 0;
  font-size: 15px;
  font-weight: 500;
  line-height: 1.6;
}

.nh-ask-question__required {
  color: var(--nh-color-danger);
}

.nh-ask-question__options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.nh-ask-option {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 8px;
  background: var(--nh-surface-base);
  color: var(--nh-color-text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background var(--nh-duration-fast) var(--nh-ease-standard),
    border-color var(--nh-duration-fast) var(--nh-ease-standard);
}

.nh-ask-option:hover {
  background: var(--nh-surface-hover);
}

.nh-ask-option--selected {
  border-color: color-mix(in srgb, var(--nh-color-accent) 45%, var(--nh-border-subtle));
  background: color-mix(in srgb, var(--nh-color-accent) 7%, transparent);
}

.nh-ask-option:disabled {
  cursor: default;
}

.nh-ask-option:disabled:hover {
  background: var(--nh-surface-base);
}

.nh-ask-option--selected:disabled:hover {
  background: color-mix(in srgb, var(--nh-color-accent) 7%, transparent);
}

.nh-ask-option__indicator {
  display: grid;
  width: 16px;
  height: 16px;
  flex: none;
  place-items: center;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 50%;
  color: var(--nh-color-bg-base);
}

.nh-ask-option--selected .nh-ask-option__indicator {
  border-color: var(--nh-color-accent);
  background: var(--nh-color-accent);
}

.nh-ask-option__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.nh-ask-option__label {
  font-size: 14px;
}

.nh-ask-option__description {
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.nh-ask-question__input {
  width: 100%;
  max-width: none;
}
</style>
