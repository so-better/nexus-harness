/**
 * Ask User 结构化提问契约：工具输入、回答与 IPC 解决参数。
 */

import { z } from 'zod';

export const askQuestionOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional()
});

export const askQuestionSchema = z.object({
  id: z.string().min(1),
  header: z.string().optional(),
  question: z.string().min(1),
  options: z.array(askQuestionOptionSchema).min(2).max(9).optional(),
  multiple: z.boolean().optional(),
  allowOther: z.boolean().optional(),
  required: z.boolean().optional()
});

export const askUserInputSchema = z.object({
  questions: z.array(askQuestionSchema).min(1).max(4)
});

export const askUserAnswerSchema = z.object({
  questionId: z.string().min(1),
  selectedOptionIds: z.array(z.string().min(1)).optional(),
  text: z.string().optional()
});

export const askUserResolveInputSchema = z.object({
  requestId: z.string().min(1),
  answers: z.array(askUserAnswerSchema).default([]),
  cancelled: z.boolean().optional()
});

export const askUserResolveResultSchema = z.object({
  requestId: z.string().min(1),
  resolved: z.boolean()
});

export type AskQuestionOption = z.infer<typeof askQuestionOptionSchema>;
export type AskQuestion = z.infer<typeof askQuestionSchema>;
export type AskUserInput = z.infer<typeof askUserInputSchema>;
export type AskUserAnswer = z.infer<typeof askUserAnswerSchema>;
export type AskUserResolveInput = z.infer<typeof askUserResolveInputSchema>;
export type AskUserResolveResult = z.infer<typeof askUserResolveResultSchema>;
