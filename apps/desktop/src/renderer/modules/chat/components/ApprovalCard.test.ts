// @vitest-environment jsdom
/**
 * 审批卡：无需展开工具详情即可看到动作摘要。
 */
import { createApp, h, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import type { ChatApproval, ChatToolCall } from '../types';
import ApprovalCard from './ApprovalCard.vue';

describe('ApprovalCard', () => {
  it('shows the command summary without expanding tool details', async () => {
    const tool: ChatToolCall = {
      id: 'call-1',
      name: 'run_command',
      input: { command: 'pnpm test', cwd: '/tmp/workspace' },
      status: 'waiting_approval'
    };
    const approval: ChatApproval = {
      id: 'approval-1',
      toolCallId: 'call-1',
      scope: 'run_command',
      status: 'pending'
    };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({
      render: () => h(ApprovalCard, { approval, tool })
    });
    app.mount(host);
    await nextTick();

    expect(host.textContent).toContain('将执行命令');
    expect(host.textContent).toContain('pnpm test');
    expect(host.textContent).toContain('/tmp/workspace');
    app.unmount();
    document.body.innerHTML = '';
  });
});
