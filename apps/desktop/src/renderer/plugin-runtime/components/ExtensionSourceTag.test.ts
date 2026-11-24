// @vitest-environment jsdom
/**
 * 扩展来源标签：内置与用户来源共用布局，仅颜色不同。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from 'vue';
import ExtensionSourceTag from './ExtensionSourceTag.vue';

const mount = (source: 'builtin' | 'user', label: string): HTMLElement => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  createApp(ExtensionSourceTag, { source, label }).mount(host);
  return host;
};

describe('ExtensionSourceTag', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the builtin label with the builtin color class', () => {
    const host = mount('builtin', '内置');

    expect(host.textContent).toContain('内置');
    expect(host.querySelector('.nh-source-tag--builtin')).not.toBeNull();
    expect(host.querySelector('.nh-source-tag__dot')).not.toBeNull();
  });

  it('renders the user label with the user color class', () => {
    const host = mount('user', '用户');

    expect(host.textContent).toContain('用户');
    expect(host.querySelector('.nh-source-tag--user')).not.toBeNull();
  });
});
