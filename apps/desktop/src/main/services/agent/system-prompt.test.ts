/**
 * 系统提示词组装：静态安全规则、模式约束与动态环境上下文。
 */
import { describe, expect, it } from 'vitest';
import { estimateTextTokens } from '@nexus/core';
import type { ChatMessage } from '@nexus/providers';
import {
  appendEnvironmentContext,
  buildAgentSystemPrompt,
  buildEnvironmentContext
} from './system-prompt';

describe('agent system prompt', () => {
  it('includes identity, safety, honesty, facts, links and file checks', () => {
    const prompt = buildAgentSystemPrompt({ mode: 'build', hasWorkspace: true });

    expect(prompt).toContain('Nexus AI Agent');
    expect(prompt).toContain('不可信');
    expect(prompt).toContain('工具与事实');
    expect(prompt).toContain('不编造数据');
    expect(prompt).toContain('只用用户或工具提供的 URL');
    expect(prompt).toContain('文件：生成/修改');
    expect(prompt).toContain('Build 模式');
    expect(prompt).toContain('图片/视频链接必须直接嵌入');
    expect(estimateTextTokens(prompt)).toBeLessThan(600);
    expect(prompt).not.toContain('当前没有工作区');
  });

  it('adds plan and no-workspace constraints when needed', () => {
    const planPrompt = buildAgentSystemPrompt({ mode: 'plan', hasWorkspace: false });

    expect(planPrompt).toContain('Plan 模式');
    expect(planPrompt).toContain('不得写文件');
    expect(planPrompt).toContain('当前没有工作区');
  });

  it('formats platform, local time and timezone', () => {
    const context = buildEnvironmentContext({
      now: new Date('2026-11-20T12:34:00Z'),
      platform: 'darwin',
      timeZone: 'Asia/Shanghai'
    });

    expect(context).toContain('<environment>');
    expect(context).toContain('平台：macOS');
    expect(context).toContain('2026');
    expect(context).toContain('时区：Asia/Shanghai');
    expect(context).toContain('</environment>');
  });

  it('appends environment context only to the last user message', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'answer' },
      { role: 'user', content: 'last' }
    ];
    const result = appendEnvironmentContext(messages, '<environment>now</environment>');

    expect(result[0]).toEqual({ role: 'system', content: 'system' });
    expect(result[1]).toEqual({ role: 'user', content: 'first' });
    expect(result[3]?.content).toBe('last\n\n<environment>now</environment>');
    expect(messages[3]?.content).toBe('last');
  });

  it('does not change messages without a user or environment block', () => {
    const messages: ChatMessage[] = [{ role: 'assistant', content: 'answer' }];

    expect(appendEnvironmentContext(messages, '<environment>now</environment>')).toBe(messages);
    expect(appendEnvironmentContext(messages, '')).toBe(messages);
  });
});
