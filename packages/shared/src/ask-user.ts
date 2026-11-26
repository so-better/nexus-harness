/**
 * Ask User 结构化提问契约：工具输入、回答与 IPC 解决参数。
 */

import { z } from 'zod';

/**
 * 单个选项：id 在请求内唯一。
 */
export const askQuestionOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional()
});

/**
 * 单个问题；无 options 时为自由文本。
 */
export const askQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  options: z.array(askQuestionOptionSchema).min(2).max(9).optional(),
  multiple: z.boolean().optional(),
  allowOther: z.boolean().optional(),
  required: z.boolean().optional()
});

/**
 * ask_user 工具输入：1–4 个问题。
 */
export const askUserInputSchema = z.object({
  questions: z.array(askQuestionSchema).min(1).max(4)
});

/**
 * 单个问题的回答：选项 id 或自由文本。
 */
export const askUserAnswerSchema = z.object({
  questionId: z.string().min(1),
  selectedOptionIds: z.array(z.string().min(1)).optional(),
  text: z.string().optional()
});

/**
 * 用户提交或取消提问的 IPC 解决参数。
 */
export const askUserResolveInputSchema = z.object({
  requestId: z.string().min(1),
  answers: z.array(askUserAnswerSchema).default([]),
  cancelled: z.boolean().optional()
});

/**
 * 提问解决结果。
 */
export const askUserResolveResultSchema = z.object({
  requestId: z.string().min(1),
  resolved: z.boolean()
});

/** 问题类型。 */
export type AskQuestion = z.infer<typeof askQuestionSchema>;
/** 回答类型。 */
export type AskUserAnswer = z.infer<typeof askUserAnswerSchema>;
/** 提问解决输入类型。 */
export type AskUserResolveInput = z.infer<typeof askUserResolveInputSchema>;
/** 提问解决结果类型。 */
export type AskUserResolveResult = z.infer<typeof askUserResolveResultSchema>;
