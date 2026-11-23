// @vitest-environment jsdom
/**
 * 推理块：流式时同时显示旋转图标与“思考中…”，结束后显示“思考过程”。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import ReasoningBlock from './ReasoningBlock.vue';

vi.mock('naive-ui', () => ({
  NButton: {
    emits: ['click'],
    template: `<button type="button" @click="$emit('click')"><slot /></button>`
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
    expect(host.querySelector('.nh-reasoning__body')?.getAttribute('style')).toContain(
      'display: none'
    );
    app.unmount();
  });

  it('expands only after the user clicks the header', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(ReasoningBlock, { text: '只有点击才展开', streaming: false });
    app.mount(host);

    const button = host.querySelector('button');
    expect(button).not.toBeNull();
    button?.click();
    await nextTick();
    expect(host.querySelector('.nh-reasoning__body')?.getAttribute('style') ?? '').not.toContain(
      'display: none'
    );
    app.unmount();
  });

  it('collapses when streaming ends if the user opened it during streaming', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const streaming = ref(true);
    const app = createApp({
      render: () => h(ReasoningBlock, { text: '用户主动展开', streaming: streaming.value })
    });
    app.mount(host);

    host.querySelector('button')?.click();
    await nextTick();
    expect(host.querySelector('.nh-reasoning__body')?.getAttribute('style') ?? '').not.toContain(
      'display: none'
    );

    streaming.value = false;
    await nextTick();
    expect(host.querySelector('.nh-reasoning__body')?.getAttribute('style')).toContain(
      'display: none'
    );
    app.unmount();
  });

  it('resets the streaming-open flag when a new stream starts', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const streaming = ref(false);
    const app = createApp({
      render: () => h(ReasoningBlock, { text: '重新开始', streaming: streaming.value })
    });
    app.mount(host);
    streaming.value = true;
    await nextTick();
    host.querySelector('button')?.click();
    await nextTick();
    streaming.value = false;
    await nextTick();
    expect(host.querySelector('.nh-reasoning__body')?.getAttribute('style')).toContain(
      'display: none'
    );
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
