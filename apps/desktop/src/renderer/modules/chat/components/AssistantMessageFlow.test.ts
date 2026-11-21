// @vitest-environment jsdom
vi.hoisted(() => {
  (window as unknown as { takeNexusBridge: () => object }).takeNexusBridge = () => ({});
});
/**
 * 助手消息内容：时间线正文、文件与工具区域的基础渲染契约。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import { NMessageProvider } from 'naive-ui';
import type { ChatMessageView } from '../types';
import AssistantMessageFlow from './AssistantMessageFlow.vue';

vi.mock('@/plugin-runtime/components/PluginSlot.vue', () => ({
  default: { name: 'PluginSlotStub', template: '<div class="plugin-slot-stub" />' }
}));

const message: ChatMessageView = {
  id: 'message-1',
  role: 'assistant',
  content: 'hello',
  toolCalls: [],
  createdAt: 0,
  timeline: [{ kind: 'content', id: 'segment-1', text: 'hello', streaming: false }]
};

const mount = async (): Promise<HTMLElement> => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const Wrapper = defineComponent({
    setup() {
      return () =>
        h(NMessageProvider, null, {
          default: () =>
            h(AssistantMessageFlow, {
              message,
              sessionId: 'session-1',
              askUsers: [],
              approvals: [],
              timeline: message.timeline ?? [],
              toolEntries: [],
              unmatchedAsks: [],
              relatedWorkspaceAuth: null,
              orphanWorkspaceAuth: null,
              contentText: 'hello',
              isTyping: false,
              showThinking: false
            })
        });
    }
  });
  const app = createApp(Wrapper);
  app.mount(host);
  await nextTick();
  await nextTick();
  return host;
};

describe('AssistantMessageFlow', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders timeline content and assistant plugin slots', async () => {
    const host = await mount();
    expect(host.textContent).toContain('hello');
    expect(host.querySelector('.plugin-slot-stub')).not.toBeNull();
  });
});
