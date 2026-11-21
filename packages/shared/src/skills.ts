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
