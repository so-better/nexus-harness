// @vitest-environment jsdom
/**
 * 「继续」条：展示提示与按钮，点击发出 resume 事件。
 */
import { createApp, h, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import ContinueRunBar from './ContinueRunBar.vue';

const mount = (onResume: () => void): HTMLElement => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  createApp({ render: () => h(ContinueRunBar, { onResume }) }).mount(host);
  return host;
};

describe('ContinueRunBar', () => {
  it('renders the hint and emits resume on click', async () => {
    const events: string[] = [];
    const host = mount(() => events.push('resume'));
    await nextTick();

    expect(host.textContent).toContain('已达最大执行步骤');
    const button = [...host.querySelectorAll('button')].find((item) =>
      (item.textContent ?? '').includes('继续')
    );
    expect(button).toBeDefined();
    button?.click();

    expect(events).toEqual(['resume']);
  });
});
