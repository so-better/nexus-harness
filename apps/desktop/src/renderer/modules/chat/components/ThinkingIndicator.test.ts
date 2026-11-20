// @vitest-environment jsdom
/**
 * 生成中提示：只显示闪烁光标，状态文案放在 aria-label。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from 'vue';
import ThinkingIndicator from './ThinkingIndicator.vue';

describe('ThinkingIndicator', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders a blinking cursor and an accessible label', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(ThinkingIndicator);
    app.mount(host);

    expect(host.querySelector('.nh-thinking__cursor')).not.toBeNull();
    expect(host.querySelector('.nh-thinking__label')).toBeNull();
    expect(host.querySelector('.nh-thinking')?.getAttribute('role')).toBe('status');
    expect(host.querySelector('.nh-thinking')?.getAttribute('aria-label')).not.toBe('');
    app.unmount();
  });
});
