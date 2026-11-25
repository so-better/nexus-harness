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

    expect(prompt).toContain('Nexus Agent');
    expect(prompt).toContain('元信息');
    expect(prompt).toContain('不可信');
    expect(prompt).toContain('事实/工具');
    expect(prompt).toContain('不编造事实');
    expect(prompt).toContain('只用用户/工具 URL');
    expect(prompt).toContain('文件：修改');
    expect(prompt).toContain('plugin-development');
    expect(prompt).toContain('search_skills');
    expect(prompt).toContain('open_url');
    expect(prompt).toContain('Build：');
    expect(prompt).toContain('图片/视频直接嵌入');
    expect(prompt).toContain('iframe');
    expect(prompt).toContain('save_file');
    expect(prompt).toContain('reasoning 只写计划');
    expect(prompt).toContain('ask_user 选择');
    expect(prompt).toContain('禁止完整代码块');
    expect(prompt).not.toContain('无工作区');
  });

  it('adds a global memory block to the dynamic environment context', () => {
    const context = buildEnvironmentContext({
      platform: 'darwin',
      memory: '<memory>\n- [preference] 回答：简洁\n</memory>'
    });
    expect(context).toContain('长期记忆');
    expect(context).toContain('简洁');
    // 记忆不得进入系统提示，否则会破坏系统提示的稳定前缀
    expect(buildAgentSystemPrompt({ mode: 'build', hasWorkspace: true })).not.toContain('简洁');
  });

  it('keeps every mode and workspace variant within the prompt budget', () => {
    // 预算较原 600 略放宽，容纳按需加载的单行提示；其带来的工具 schema 节省远大于此
    for (const mode of ['plan', 'build'] as const) {
      for (const hasWorkspace of [true, false]) {
        expect(estimateTextTokens(buildAgentSystemPrompt({ mode, hasWorkspace }))).toBeLessThan(
          640
        );
      }
    }
  });

  it('adds plan and no-workspace constraints when needed', () => {
    const planPrompt = buildAgentSystemPrompt({ mode: 'plan', hasWorkspace: false });

    expect(planPrompt).toContain('Plan：');
    expect(planPrompt).toContain('不得写文件');
    expect(planPrompt).toContain('无工作区');
    expect(planPrompt).toContain('Plan 只读');
    expect(planPrompt).not.toContain('save_file');
    expect(planPrompt).not.toContain('open_url');
  });

  it('formats platform, local time and timezone', () => {
    const context = buildEnvironmentContext({
      now: new Date('2026-11-20T12:34:00Z'),
      platform: 'darwin',
      timeZone: 'Asia/Shanghai',
      roots: ['/Users/lingkai/Desktop/my-codes'],
      providerName: 'DeepSeek',
      model: 'deepseek-chat'
    });

    expect(context).toContain('<environment>');
    expect(context).toContain('应用：Nexus');
    expect(context).toContain('提供商：DeepSeek');
    expect(context).toContain('模型：deepseek-chat');
    expect(context).toContain('平台：macOS');
    expect(context).toContain('2026');
    expect(context).toContain('时区：Asia/Shanghai');
    expect(context).toContain('授权目录：\n- /Users/lingkai/Desktop/my-codes');
    expect(context).toContain('</environment>');
    expect(estimateTextTokens(context)).toBeLessThan(100);
    expect(() => buildEnvironmentContext({ timeZone: '' })).not.toThrow();
    expect(
      buildEnvironmentContext({
        now: new Date('2026-11-20T12:34:00Z'),
        platform: 'linux',
        timeZone: 'Invalid/Zone'
      })
    ).toContain('时区：本地');
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
