/**
 * 显式 Skill 调用文本：解析与还原规则。
 */
import { describe, expect, it } from 'vitest';
import { buildSkillPrompt, parseExplicitSkill } from './skills';

describe('explicit skill invocation', () => {
  it('parses a skill id and prompt', () => {
    expect(parseExplicitSkill(' /fix-tests 帮我修复 ')).toEqual({
      id: 'fix-tests',
      prompt: '帮我修复'
    });
  });

  it('returns undefined for ordinary text', () => {
    expect(parseExplicitSkill('帮我修复')).toBeUndefined();
  });

  it('builds a skill-only prompt', () => {
    expect(buildSkillPrompt('fix-tests', '')).toBe('/fix-tests');
  });

  it('builds a skill prompt with text and leaves plain prompts untouched', () => {
    expect(buildSkillPrompt('fix-tests', ' 帮我修复 ')).toBe('/fix-tests 帮我修复');
    expect(buildSkillPrompt(undefined, ' 帮我修复 ')).toBe('帮我修复');
  });
});
