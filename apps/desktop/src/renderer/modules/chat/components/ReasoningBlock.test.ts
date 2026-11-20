// @vitest-environment jsdom
/**
 * 推理块：流式时同时显示旋转图标与“思考中…”，结束后显示“思考过程”。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from 'vue';
import ReasoningBlock from './ReasoningBlock.vue';

vi.mock('naive-ui', () => ({
  NButton: {
    template: '<button type="button"><slot /></button>'
  }
}));

vi.mock('@/components/AppIcon.vue', () => ({
  default: {
    props: ['name', 'size'],
    template: '<span class="mock-icon" :data-name="name" />'
  }
}));

vi.mock('../render/MarkdownSegments.vue', () => ({
  default: {
    props: ['content', 'streaming'],
    template: '<div class="mock-segments" />'
  }
}));

describe('ReasoningBlock', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows a spinner and thinking label while streaming', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(ReasoningBlock, { text: '先确认失败测试', streaming: true });
    app.mount(host);

    expect(host.querySelector('.nh-reasoning__label')?.textContent.trim()).toBe('思考中…');
    expect(host.querySelector('.nh-reasoning__spin')).not.toBeNull();
    expect(host.querySelector('.mock-icon')?.getAttribute('data-name')).toBe('loader');
    app.unmount();
  });

  it('shows the reasoning title after streaming ends', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(ReasoningBlock, { text: '先确认失败测试', streaming: false });
    app.mount(host);

    expect(host.querySelector('.nh-reasoning__label')?.textContent.trim()).toBe('思考过程');
    expect(host.querySelector('.nh-reasoning__spin')).toBeNull();
    expect(host.querySelector('.mock-icon')?.getAttribute('data-name')).toBe('lightbulb');
    app.unmount();
  });
});
