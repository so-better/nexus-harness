// @vitest-environment jsdom
/**
 * 消息列表加载占位：首 token 前显示，助手开始流式后隐藏。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import type { ChatMessageView } from '../types';
import MessageList from './MessageList.vue';

vi.mock('./ChatMessageItem.vue', () => ({
  default: { name: 'ChatMessageItemStub', template: '<div class="chat-stub" />' }
}));

const userMessage: ChatMessageView = {
  id: 'u1',
  role: 'user',
  content: 'hello',
  toolCalls: [],
  createdAt: 0
};
const assistantMessage: ChatMessageView = {
  id: 'a1',
  role: 'assistant',
  content: '',
  toolCalls: [],
  createdAt: 1,
  streaming: true
};

describe('MessageList thinking placeholder', () => {
  const originalScrollTo = HTMLElement.prototype.scrollTo;

  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn()
    });
  });

  afterEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: originalScrollTo
    });
    document.body.innerHTML = '';
  });

  it('shows before the first assistant stream and hides once it starts', async () => {
    const messages = ref<ChatMessageView[]>([userMessage]);
    const thinking = ref(true);
    const Wrapper = defineComponent({
      setup() {
        return () =>
          h(MessageList, {
            messages: messages.value,
            thinking: thinking.value,
            sessionId: 'session-1'
          });
      }
    });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(Wrapper);
    app.mount(host);
    await nextTick();

    expect(host.querySelector('.nh-thinking')).not.toBeNull();

    messages.value = [userMessage, assistantMessage];
    await nextTick();
    expect(host.querySelector('.nh-thinking')).toBeNull();

    thinking.value = false;
    await nextTick();
    expect(host.querySelector('.nh-thinking')).toBeNull();
    app.unmount();
  });

  it('inserts a date divider when messages cross a day boundary', async () => {
    const first = { ...userMessage, id: 'u-old', createdAt: new Date(2020, 0, 1, 10).getTime() };
    const second = { ...userMessage, id: 'u-new', createdAt: new Date(2021, 0, 1, 10).getTime() };
    const messages = ref<ChatMessageView[]>([first, second]);
    const Wrapper = defineComponent({
      setup() {
        return () => h(MessageList, { messages: messages.value, sessionId: 'session-1' });
      }
    });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(Wrapper);
    app.mount(host);
    await nextTick();

    const labels = [...host.querySelectorAll('.nh-message-list__date')].map((node) =>
      node.textContent?.trim()
    );
    expect(labels).toHaveLength(2);
    expect(labels[0]).toContain('2020');
    expect(labels[1]).toContain('2021');
    app.unmount();
  });

  it('scrolls to the latest message on initial mount', async () => {
    const messages: ChatMessageView[] = [userMessage];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const originalScrollHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollHeight'
    );
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains('nh-message-list') ? 480 : 0;
      }
    });

    try {
      const app = createApp({
        render: () => h(MessageList, { messages, sessionId: 'session-1' })
      });
      app.mount(host);
      await nextTick();

      const viewport = host.querySelector<HTMLElement>('.nh-message-list');
      if (!viewport) throw new Error('message viewport missing');
      expect(viewport.scrollTop).toBe(480);
      app.unmount();
    } finally {
      if (originalScrollHeight) {
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', originalScrollHeight);
      }
    }
  });

  it('keeps following late content growth while the user is at the bottom', async () => {
    const callbacks: ResizeObserverCallback[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          callbacks.push(callback);
        }
        observe(): void {}
        disconnect(): void {}
        unobserve(): void {}
      }
    );
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({
      render: () => h(MessageList, { messages: [userMessage], sessionId: 'session-1' })
    });

    try {
      app.mount(host);
      await nextTick();
      const viewport = host.querySelector<HTMLElement>('.nh-message-list');
      if (!viewport) throw new Error('message viewport missing');
      Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 720 });

      callbacks[0]?.([], {} as ResizeObserver);
      await nextTick();
      expect(viewport.scrollTop).toBe(720);
    } finally {
      app.unmount();
      vi.unstubAllGlobals();
    }
  });

  it('does not force-scroll a compaction notice when the user is reading history', async () => {
    const messages = ref<ChatMessageView[]>([userMessage]);
    const Wrapper = defineComponent({
      setup() {
        return () =>
          h(MessageList, {
            messages: messages.value,
            sessionId: 'session-1'
          });
      }
    });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(Wrapper);

    try {
      app.mount(host);
      await nextTick();
      const viewport = host.querySelector<HTMLElement>('.nh-message-list');
      if (!viewport) throw new Error('message viewport missing');
      Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 720 });
      Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 200 });
      viewport.scrollTop = 120;
      viewport.dispatchEvent(new Event('scroll'));
      const scrollTo = vi.mocked(HTMLElement.prototype.scrollTo);
      scrollTo.mockClear();

      messages.value = [
        userMessage,
        {
          id: 'compaction-1',
          role: 'system',
          content: '上下文压缩',
          toolCalls: [],
          createdAt: 2,
          compactionNotice: true
        }
      ];
      await nextTick();
      await nextTick();

      // 与普通助手消息一致：用户没有贴底时，不强行拉回底部
      expect(scrollTo).not.toHaveBeenCalled();
    } finally {
      app.unmount();
    }
  });

  it('returns to the latest message when switching sessions', async () => {
    const messages = ref<ChatMessageView[]>([userMessage]);
    const sessionId = ref('session-1');
    const Wrapper = defineComponent({
      setup() {
        return () =>
          h(MessageList, {
            messages: messages.value,
            sessionId: sessionId.value
          });
      }
    });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(Wrapper);
    app.mount(host);
    await nextTick();

    const viewport = host.querySelector<HTMLElement>('.nh-message-list');
    if (!viewport) throw new Error('message viewport missing');
    Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 480 });
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 200 });

    sessionId.value = 'session-2';
    await nextTick();
    await nextTick();

    expect(viewport.scrollTop).toBe(480);
    app.unmount();
  });
});
