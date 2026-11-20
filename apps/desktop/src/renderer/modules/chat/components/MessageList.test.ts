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
});
