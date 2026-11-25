/**
 * 「继续」入口判定：仅在最近一次 Run 因步数上限失败、未运行且已配置模型时提供。
 */

import type { ChatMessageView, ChatProjection } from './types';

/** 中日韩统一表意文字（含扩展 A 与兼容区），用于判断对话是否以中文为主。 */
const HAN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

/**
 * 继续文案：刻意跟随“对话语言”，不随 UI 语言走，因此不进 i18n 字典。
 */
const CONTINUE_PROMPT = { zh: '继续', en: 'Continue' } as const;

/**
 * 继续消息文案跟随“对话语言”而非 UI 语言：最后一条非空用户消息含汉字则用「继续」，否则用英文。
 * 说明：当前仅区分中/英；纯日文假名或韩文会回退英文，含汉字的日文会判为中文。
 */
export const continuePromptFor = (messages: readonly ChatMessageView[]): string => {
  const lastUser = [...messages]
    .reverse()
    .find((message) => message.role === 'user' && message.content.trim());
  return HAN.test(lastUser?.content ?? '') ? CONTINUE_PROMPT.zh : CONTINUE_PROMPT.en;
};

interface ContinueOfferOptions {
  /** 是否正在运行（含乐观运行态） */
  running: boolean;
  /** 是否已选择服务商与模型，能发起新 Run */
  hasModel: boolean;
}

/**
 * 判断是否展示“继续”入口。
 */
export const shouldOfferContinue = (
  projection: ChatProjection,
  options: ContinueOfferOptions
): boolean =>
  projection.status === 'failed' &&
  projection.errorCode === 'RUN_MAX_STEPS' &&
  !options.running &&
  options.hasModel;
