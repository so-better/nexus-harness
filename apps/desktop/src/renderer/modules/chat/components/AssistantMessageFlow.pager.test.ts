// @vitest-environment jsdom
vi.hoisted(() => {
  (window as unknown as { takeNexusBridge: () => object }).takeNexusBridge = () => ({});
});
/**
 * 助手消息：多个待审批合并为分页，而不是逐个铺开。
 */
import { createApp, defineComponent, h, nextTick } from 'vue';
import { NMessageProvider } from 'naive-ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatApproval, ChatMessageView, ChatToolCall } from '../types';
import AssistantMessageFlow from './AssistantMessageFlow.vue';

vi.mock('@/plugin-runtime/components/PluginSlot.vue', () => ({
  default: { name: 'PluginSlotStub', template: '<div class="plugin-slot-stub" />' }
}));

const tool = (id: string, command: string): ChatToolCall => ({
  id,
  name: 'run_command',
  input: { command },
  status: 'waiting_approval'
});

const tool1: ChatToolCall = { ...tool('call-1', 'echo one'), approvalId: 'approval-1' };
const tool2: ChatToolCall = { ...tool('call-2', 'echo two'), approvalId: 'approval-2' };

const message: ChatMessageView = {
  id: 'message-1',
  role: 'assistant',
  content: '',
  toolCalls: [tool1, tool2],
  createdAt: 0,
  timeline: [
    { kind: 'tool', id: 'segment-1', toolCallId: 'call-1' },
    { kind: 'tool', id: 'segment-2', toolCallId: 'call-2' }
  ]
};

const approvals: ChatApproval[] = [
  { id: 'approval-1', toolCallId: 'call-1', scope: 'run_command', status: 'pending' },
  { id: 'approval-2', toolCallId: 'call-2', scope: 'run_command', status: 'pending' }
];

const mount = async (
  overrides: { message?: ChatMessageView; approvals?: ChatApproval[] } = {}
): Promise<HTMLElement> => {
  const activeMessage = overrides.message ?? message;
  const activeApprovals = overrides.approvals ?? approvals;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const Wrapper = defineComponent({
    setup() {
      return () =>
        h(NMessageProvider, null, {
          default: () =>
            h(AssistantMessageFlow, {
              message: activeMessage,
              sessionId: 'session-1',
              askUsers: [],
              approvals: activeApprovals,
              timeline: activeMessage.timeline ?? [],
              toolEntries: [],
              unmatchedAsks: [],
              relatedWorkspaceAuth: null,
              orphanWorkspaceAuth: null,
              contentText: '',
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

describe('AssistantMessageFlow approval pager', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('collapses multiple pending approvals into a single pager', async () => {
    const host = await mount();

    expect(host.querySelectorAll('.nh-authorization')).toHaveLength(1);
    expect(host.textContent).toContain('echo one');
    expect(host.textContent).not.toContain('echo two');
    expect(host.textContent).toContain('1 / 2');
  });

  it('only pages approvals that belong to its own message', async () => {
    // 另一个消息/子代理的审批不应被合并进来
    const foreign: ChatApproval = {
      id: 'approval-foreign',
      toolCallId: 'call-foreign',
      scope: 'run_command',
      status: 'pending'
    };
    const host = await mount({ approvals: [...approvals, foreign] });

    expect(host.textContent).toContain('1 / 2');
    expect(host.textContent).not.toContain('1 / 3');
  });
});
