<template>
  <section
    class="nh-ask-user"
    :class="{
      'nh-ask-user--embedded': embedded,
      'nh-ask-user--pending': isPending,
      'nh-ask-user--resolved': isResolved
    }"
    @keydown.esc.prevent="onEscape"
  >
    <div class="nh-ask-user__main">
      <span v-if="!embedded" class="nh-ask-user__icon">
        <AppIcon :name="isResolved ? 'check' : 'info'" :size="18" />
      </span>

      <div class="nh-ask-user__body">
        <template v-if="isPending">
          <AskUserQuestion
            v-if="currentQuestion"
            :key="currentQuestion.id"
            :question="currentQuestion"
            :selected-ids="selected[currentQuestion.id] ?? []"
            :text="texts[currentQuestion.id] ?? ''"
            @toggle="toggleOption(currentQuestion, $event)"
            @update:text="texts[currentQuestion.id] = $event"
            @submit="goNextOrSubmit"
          />
        </template>

        <div v-else-if="isResolved" class="nh-ask-user__summary">
          <p class="nh-ask-user__status nh-ask-user__status--done" role="status" aria-live="polite">
            <AppIcon name="check" :size="13" />
            {{ t('chat.askUserAnswered') }}
          </p>
          <dl class="nh-ask-user__answers">
            <div v-for="entry in answerSummary" :key="entry.questionId" class="nh-ask-user__answer">
              <dt class="nh-ask-user__answer-question">{{ entry.question }}</dt>
              <dd class="nh-ask-user__answer-value">{{ entry.answer }}</dd>
            </div>
          </dl>
        </div>

        <div v-else class="nh-ask-user__summary">
          <p class="nh-ask-user__status" role="status" aria-live="polite">
            {{ t('chat.askUserCancelled') }}
          </p>
          <p class="nh-ask-user__cancelled-question">{{ cancelledQuestions }}</p>
        </div>
      </div>
    </div>

    <AskUserFooter
      v-if="isPending"
      :show-error="attempted && !canSubmit"
      :index="currentIndex"
      :total="total"
      @cancel="emit('cancel')"
      @prev="goPrev"
      @next="goNextOrSubmit"
      @submit="submitAnswers"
    />
  </section>
</template>

<script setup lang="ts">
/**
 * Ask User 行内卡片：管理回答状态并提交结构化答案。
 */

import { computed, reactive, ref, watch } from 'vue';
import type { AskQuestion, AskUserAnswer } from '@shared/ask-user';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import type { ChatAskUser } from '../types';
import { buildAnswerSummary, joinQuestionTexts } from '../ask-user-summary';
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
/**
 * 当前分页索引：一次提问包含多个问题时逐题展示，避免全部铺开。
 */
const currentIndex = ref(0);

for (const question of props.ask.questions) {
  const answer = props.ask.answers?.find((item) => item.questionId === question.id);
  selected[question.id] = [...(answer?.selectedOptionIds ?? [])];
  texts[question.id] = answer?.text ?? '';
}

const isPending = computed(() => props.ask.status === 'pending');
const isResolved = computed(() => props.ask.status === 'resolved');
const total = computed(() => props.ask.questions.length);
const currentQuestion = computed<AskQuestion | undefined>(
  () => props.ask.questions[currentIndex.value]
);
const isLastQuestion = computed(() => currentIndex.value >= total.value - 1);

/**
 * 问题数量变化时夹紧索引，避免索引越界导致页码与内容错位。
 */
watch(total, (length) => {
  if (length === 0) {
    currentIndex.value = 0;
    return;
  }
  if (currentIndex.value > length - 1) currentIndex.value = length - 1;
});

/**
 * 上一题；首题禁用后不会小于 0。
 */
const goPrev = (): void => {
  if (currentIndex.value > 0) currentIndex.value -= 1;
};

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

/**
 * 已取消状态保留问题原文，便于回看当时被跳过的内容。
 */
const cancelledQuestions = computed(() => joinQuestionTexts(props.ask.questions));

/**
 * 已回答状态只回显问题与最终选择，避免重复铺开全部选项。
 */
const answerSummary = computed(() =>
  buildAnswerSummary(props.ask.questions, props.ask.answers, t('chat.askUserNoAnswer'))
);

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
  // 必答项缺失时跳到第一道未回答的问题，而不是静默失败
  const missingIndex = props.ask.questions.findIndex(
    (question) => question.required && !hasAnswer(question)
  );
  if (missingIndex >= 0) {
    currentIndex.value = missingIndex;
    return;
  }
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

/**
 * 非最后一题前进到下一题，最后一题执行一次完整提交。
 */
const goNextOrSubmit = (): void => {
  if (!isLastQuestion.value) {
    currentIndex.value += 1;
    return;
  }
  submitAnswers();
};
</script>

<style scoped lang="less">
.nh-ask-user {
  /** 图标尺寸与问题首行行盒高度（15px × 1.6）；用于图标与首行垂直居中 */
  --nh-ask-icon-size: 32px;
  --nh-ask-question-line: 24px;

  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--nh-color-accent) 28%, var(--nh-border-subtle));
  border-radius: var(--nh-radius-lg);
  background: var(--nh-surface-base);
  box-shadow: var(--nh-shadow-card);
}

.nh-ask-user__main {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.nh-ask-user--embedded {
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--nh-border-subtle) 55%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--nh-color-bg-elevated) 70%, transparent);
  box-shadow: none;
}

.nh-ask-user--resolved .nh-ask-user__main {
  gap: 10px;
}

.nh-ask-user--embedded.nh-ask-user--pending {
  box-shadow: var(--nh-shadow-card);
}

.nh-ask-user__icon {
  display: grid;
  width: var(--nh-ask-icon-size);
  height: var(--nh-ask-icon-size);
  flex: none;
  place-items: center;
  border-radius: 8px;
  background: color-mix(in srgb, var(--nh-color-accent) 10%, transparent);
  color: var(--nh-color-accent);
}

// 待回答时让图标中心与问题首行行盒中心对齐
.nh-ask-user--pending .nh-ask-user__icon {
  margin-top: calc((var(--nh-ask-question-line) - var(--nh-ask-icon-size)) / 2);
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

.nh-ask-user__status {
  margin: 0;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-ask-user__cancelled-question {
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.nh-ask-user__status--done {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--nh-color-success);
}

.nh-ask-user__summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nh-ask-user__answers {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
}

.nh-ask-user__answer {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nh-ask-user__answer-question {
  margin: 0;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-ask-user__answer-value {
  margin: 0;
  color: var(--nh-color-text-primary);
  font-size: 14px;
  line-height: 1.5;
}
</style>
