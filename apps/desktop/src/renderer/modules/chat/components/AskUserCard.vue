<template>
  <section
    class="nh-ask-user"
    :class="{ 'nh-ask-user--embedded': embedded, 'nh-ask-user--resolved': isResolved }"
    @keydown.esc.prevent="onEscape"
  >
    <span v-if="!embedded" class="nh-ask-user__icon">
      <AppIcon :name="isResolved ? 'check' : 'info'" :size="18" />
    </span>

    <div class="nh-ask-user__body">
      <header v-if="!isResolved" class="nh-ask-user__header">
        <p class="nh-ask-user__title">{{ statusTitle }}</p>
        <p v-if="isPending" class="nh-ask-user__hint">{{ t('chat.askUserHint') }}</p>
      </header>

      <AskUserQuestion
        v-for="question in ask.questions"
        :key="question.id"
        :question="question"
        :selected-ids="selected[question.id] ?? []"
        :text="texts[question.id] ?? ''"
        :disabled="!isPending"
        :resolved="isResolved"
        @toggle="toggleOption(question, $event)"
        @update:text="texts[question.id] = $event"
        @submit="submitAnswers"
      />

      <AskUserFooter
        v-if="isPending"
        :show-error="attempted && !canSubmit"
        @cancel="emit('cancel')"
        @submit="submitAnswers"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * Ask User 行内卡片：管理回答状态并提交结构化答案。
 */

import { computed, reactive, ref } from 'vue';
import type { AskQuestion, AskUserAnswer } from '@shared/ask-user';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import type { ChatAskUser } from '../types';
import AskUserFooter from './AskUserFooter.vue';
import AskUserQuestion from './AskUserQuestion.vue';

const props = withDefaults(defineProps<{ ask: ChatAskUser; embedded?: boolean }>(), {
  embedded: false
});

const emit = defineEmits<{
  submit: [answers: AskUserAnswer[]];
  cancel: [];
}>();

const attempted = ref(false);
const selected = reactive<Record<string, string[]>>({});
const texts = reactive<Record<string, string>>({});

for (const question of props.ask.questions) {
  const answer = props.ask.answers?.find((item) => item.questionId === question.id);
  selected[question.id] = [...(answer?.selectedOptionIds ?? [])];
  texts[question.id] = answer?.text ?? '';
}

/**
 * 单选替换，多选切换。
 */
const toggleOption = (question: AskQuestion, optionId: string): void => {
  if (!isPending.value) return;
  const current = selected[question.id] ?? [];
  if (question.multiple) {
    selected[question.id] = current.includes(optionId)
      ? current.filter((id) => id !== optionId)
      : [...current, optionId];
    return;
  }
  selected[question.id] = [optionId];
};

/**
 * 必答问题必须提供选项或文本。
 */
const hasAnswer = (question: AskQuestion): boolean =>
  (selected[question.id]?.length ?? 0) > 0 || Boolean(texts[question.id]?.trim());

const canSubmit = computed(() =>
  props.ask.questions.every((question) => !question.required || hasAnswer(question))
);

const isPending = computed(() => props.ask.status === 'pending');
const isResolved = computed(() => props.ask.status === 'resolved');
const statusTitle = computed(() => {
  if (props.ask.status === 'cancelled') return t('chat.askUserCancelled');
  return t('chat.askUserTitle');
});

/**
 * Esc 只关闭仍待回答的提问，已回显的卡片不再触发取消。
 */
const onEscape = (): void => {
  if (isPending.value) emit('cancel');
};

/**
 * 组装回答并交给父级提交。
 */
const submitAnswers = (): void => {
  attempted.value = true;
  if (!canSubmit.value) return;
  const answers = props.ask.questions.map<AskUserAnswer>((question) => {
    const selectedOptionIds = [...(selected[question.id] ?? [])];
    const text = texts[question.id]?.trim() ?? '';
    return {
      questionId: question.id,
      ...(selectedOptionIds.length ? { selectedOptionIds } : {}),
      ...(text ? { text } : {})
    };
  });
  emit('submit', answers);
};
</script>

<style scoped lang="less">
.nh-ask-user {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--nh-color-accent) 28%, var(--nh-color-border));
  border-radius: var(--nh-radius-lg);
  background: var(--nh-color-bg-base);
  box-shadow: var(--nh-shadow-card);
}

.nh-ask-user--embedded {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.nh-ask-user--resolved {
  gap: 10px;
}

.nh-ask-user__icon {
  display: grid;
  width: 32px;
  height: 32px;
  flex: none;
  place-items: center;
  border-radius: 8px;
  background: color-mix(in srgb, var(--nh-color-accent) 10%, transparent);
  color: var(--nh-color-accent);
}

.nh-ask-user__body {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 12px;
}

.nh-ask-user--resolved .nh-ask-user__body {
  gap: 9px;
}

.nh-ask-user__header {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nh-ask-user__title,
.nh-ask-user__hint {
  margin: 0;
}

.nh-ask-user__title {
  font-size: 14px;
  font-weight: 500;
}

.nh-ask-user__hint {
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}
</style>
