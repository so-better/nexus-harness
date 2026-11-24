// @vitest-environment jsdom
vi.hoisted(() => {
  (window as unknown as { takeNexusBridge: () => object }).takeNexusBridge = () => ({});
});
/**
 * 用户消息正文：显式 Skill 调用渲染为紧凑标签，正文保持在同一行。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from 'vue';
import UserMessageContent from './UserMessageContent.vue';

const mount = (content: string): HTMLElement => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  createApp(UserMessageContent, { content }).mount(host);
  return host;
};

describe('UserMessageContent', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders an explicit skill as a tag and keeps the prompt text', () => {
    const host = mount('/fix-tests 帮我修复失败测试');

    expect(host.querySelector('.nh-skill-tag')?.textContent).toContain('fix-tests');
    expect(host.querySelector('.nh-user-message__prompt')?.textContent).toBe('帮我修复失败测试');
    expect(host.textContent).not.toContain('/fix-tests 帮我');
  });

  it('matches an explicit skill after leading whitespace', () => {
    const host = mount('  /fix-tests 帮我修复');

    expect(host.querySelector('.nh-skill-tag')?.textContent).toContain('fix-tests');
    expect(host.querySelector('.nh-user-message__prompt')?.textContent).toBe('帮我修复');
  });

  it('leaves ordinary text unchanged', () => {
    const host = mount('普通问题');

    expect(host.querySelector('.nh-skill-tag')).toBeNull();
    expect(host.querySelector('.nh-user-message__prompt')?.textContent).toBe('普通问题');
  });
});
