/**
 * Ask User 终态摘要：把已提交的答案整理为可展示文本。
 */

import type { AskQuestion, AskUserAnswer } from '@shared/ask-user';

/**
 * 单条问答摘要，question 为问题原文，answer 为最终选择或自由文本。
 */
export interface AskUserAnswerSummary {
  questionId: string;
  question: string;
  answer: string;
}

/**
 * 将问题与答案映射为「问题 → 选择/文本」列表。
 * 选项 id 找不到对应文案时回退显示原始 id，避免信息丢失；无答案时使用 emptyLabel。
 */
export const buildAnswerSummary = (
  questions: AskQuestion[],
  answers: AskUserAnswer[] | undefined,
  emptyLabel: string
): AskUserAnswerSummary[] =>
  questions.map((question) => {
    const answer = answers?.find((item) => item.questionId === question.id);
    const labels = (answer?.selectedOptionIds ?? []).map(
      (id) => question.options?.find((option) => option.id === id)?.label ?? id
    );
    const text = answer?.text?.trim();
    return {
      questionId: question.id,
      question: question.question,
      answer: [...labels, ...(text ? [text] : [])].join('、') || emptyLabel
    };
  });

/**
 * 已取消状态只保留问题原文，便于回看被跳过的内容。
 */
export const joinQuestionTexts = (questions: AskQuestion[]): string =>
  questions.map((question) => question.question).join('；');
