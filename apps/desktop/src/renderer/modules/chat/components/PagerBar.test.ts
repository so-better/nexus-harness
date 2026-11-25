// @vitest-environment jsdom
/**
 * 通用分页条：页码文本、首尾按钮禁用与翻页事件。
 */
import { createApp, h, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import PagerBar from './PagerBar.vue';

const mount = (
  index: number,
  total: number,
  handlers: { onPrev?: () => void; onNext?: () => void } = {}
): HTMLElement => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(PagerBar, { index, total, ...handlers }) });
  app.mount(host);
  return host;
};

const button = (host: HTMLElement, label: string): HTMLButtonElement => {
  const el = host.querySelector(`button[aria-label="${label}"]`);
  if (!el) throw new Error(`button not found: ${label}`);
  return el as HTMLButtonElement;
};

describe('PagerBar', () => {
  it('shows progress and disables prev on the first page', async () => {
    const host = mount(0, 3);
    await nextTick();
    expect(host.textContent).toContain('1 / 3');
    expect(button(host, '上一个').disabled).toBe(true);
    expect(button(host, '下一个').disabled).toBe(false);
  });

  it('disables next on the last page', async () => {
    const host = mount(2, 3);
    await nextTick();
    expect(button(host, '下一个').disabled).toBe(true);
  });

  it('emits prev/next when clicking enabled arrows', async () => {
    const events: string[] = [];
    const host = mount(1, 3, {
      onPrev: () => events.push('prev'),
      onNext: () => events.push('next')
    });
    await nextTick();
    button(host, '上一个').click();
    button(host, '下一个').click();
    expect(events).toEqual(['prev', 'next']);
  });
});
