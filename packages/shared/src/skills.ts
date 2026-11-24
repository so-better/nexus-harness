/**
 * Skill 元信息、完整内容与资源文件契约。
 */

export interface SkillSummary {
  id: string;
  source: 'builtin' | 'user';
  name: string;
  description: string;
  tags: string[];
  version: string;
  requires: string[];
  license?: string;
  compatibility?: string;
  allowedTools?: string[];
  metadata?: Record<string, unknown>;
  assets?: string[];
  scripts?: string[];
  references?: string[];
}

export interface SkillDetail extends SkillSummary {
  content: string;
}

/** 显式 Skill 调用文本的前缀规则：/skill-id [prompt] */
const EXPLICIT_SKILL_PATTERN = /^\/([a-zA-Z0-9._-]+)(?:\s+([\s\S]*))?$/;

export interface ExplicitSkillInvocation {
  id: string;
  prompt: string;
}

/**
 * 解析 /skill-id [prompt]；无有效 Skill ID 时返回 undefined。
 */
export const parseExplicitSkill = (content: string): ExplicitSkillInvocation | undefined => {
  const match = EXPLICIT_SKILL_PATTERN.exec(content.trim());
  const id = match?.[1];
  if (!id) return undefined;
  return { id, prompt: match[2]?.trim() ?? '' };
};

/**
 * 将 Skill ID 与提示词还原为显式调用文本，供发送和保存使用。
 */
export const buildSkillPrompt = (skillId: string | undefined, prompt: string): string => {
  const text = prompt.trim();
  return skillId ? `/${skillId}${text ? ` ${text}` : ''}` : text;
};
