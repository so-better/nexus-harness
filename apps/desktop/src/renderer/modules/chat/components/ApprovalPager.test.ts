// @vitest-environment jsdom
/**
 * 审批分页：多个待审批逐项展示，批准事件带出当前审批 id。
 */
import { createApp, h, nextTick, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import type { ChatApproval, ChatToolCall } from '../types';
import ApprovalPager from './ApprovalPager.vue';

const tool = (id: string, command: string): ChatToolCall => ({
  id,
  name: 'run_command',
  input: { command },
  status: 'waiting_approval'
});

const approval = (id: string, toolCallId: string): ChatApproval => ({
  id,
  toolCallId,
  scope: 'run_command',
  status: 'pending'
});

const items = [
  { approval: approval('approval-1', 'call-1'), tool: tool('call-1', 'echo one') },
  { approval: approval('approval-2', 'call-2'), tool: tool('call-2', 'echo two') }
];

const mount = (onApprove: (id: string) => void): HTMLElement => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(ApprovalPager, { items, onApprove }) });
  app.mount(host);
  return host;
};

describe('ApprovalPager', () => {
  it('renders one approval at a time and emits the current id', async () => {
    const approved: string[] = [];
    const host = mount((id) => approved.push(id));
    await nextTick();
    await nextTick();

    expect(host.querySelectorAll('.nh-authorization')).toHaveLength(1);
    expect(host.textContent).toContain('echo one');
    expect(host.textContent).not.toContain('echo two');
    expect(host.textContent).toContain('1 / 2');

    const next = host.querySelector('button[aria-label="下一个"]') as HTMLButtonElement | null;
    expect(next).not.toBeNull();
    next?.click();
    await nextTick();

    expect(host.textContent).toContain('echo two');
    expect(host.textContent).toContain('2 / 2');

    const allow = [...host.querySelectorAll('button')].find((button) =>
      (button.textContent ?? '').includes('允许')
    ) as HTMLButtonElement | undefined;
    allow?.click();

    expect(approved).toEqual(['approval-2']);
  });

  it('clamps the index when the list shrinks', async () => {
    const list = ref([...items]);
    const host = document.createElement('div');
    document.body.appendChild(host);
    createApp({ render: () => h(ApprovalPager, { items: list.value }) }).mount(host);
    await nextTick();
    await nextTick();

    // 翻到第二页
    (host.querySelector('button[aria-label="下一个"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.textContent).toContain('echo two');

    // 列表缩短到 1 项后索引需夹紧回 0，而不是停在空页
    const first = items[0];
    if (first) list.value = [first];
    await nextTick();
    await nextTick();

    expect(host.textContent).toContain('echo one');
    expect(host.textContent).not.toContain('echo two');
  });
});
