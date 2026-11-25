// @vitest-environment jsdom
/**
 * Ask User 卡片：多个问题分页展示，最后一题提交全部答案。
 */
import { createApp, h, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import type { AskUserAnswer } from '@shared/ask-user';
import type { ChatAskUser } from '../types';
import AskUserCard from './AskUserCard.vue';

const questionA = {
  id: 'q1',
  question: '第一个问题',
  options: [
    { id: 'a', label: '选项 A' },
    { id: 'b', label: '选项 B' }
  ],
  required: true
};
const questionB = {
  id: 'q2',
  question: '第二个问题',
  options: [{ id: 'c', label: '选项 C' }],
  required: true
};

const ask: ChatAskUser = {
  requestId: 'req-1',
  questions: [questionA, questionB],
  status: 'pending'
};

const findButton = (host: HTMLElement, label: string): HTMLButtonElement => {
  const button = [...host.querySelectorAll('button')].find((item) =>
    (item.textContent ?? '').includes(label)
  );
  if (!button) throw new Error(`button not found: ${label}`);
  return button as HTMLButtonElement;
};

const clickOption = (host: HTMLElement, label: string): void => {
  const button = [...host.querySelectorAll('button.nh-ask-option')].find((item) =>
    (item.textContent ?? '').includes(label)
  );
  if (!button) throw new Error(`option not found: ${label}`);
  (button as HTMLButtonElement).click();
};

const mount = (
  onSubmit: (answers: AskUserAnswer[]) => void,
  activeAsk: ChatAskUser = ask
): HTMLElement => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(AskUserCard, { ask: activeAsk, onSubmit }) });
  app.mount(host);
  return host;
};

describe('AskUserCard', () => {
  it('paginates questions and submits all answers', async () => {
    const answers: AskUserAnswer[] = [];
    const host = mount((value) => answers.push(...value));
    await nextTick();

    // 首屏只展示第一题
    expect(host.textContent).toContain('第一个问题');
    expect(host.textContent).not.toContain('第二个问题');
    expect(host.textContent).toContain('1 / 2');

    clickOption(host, '选项 A');
    await nextTick();
    findButton(host, '下一题').click();
    await nextTick();

    // 第二题出现，进度更新
    expect(host.textContent).toContain('第二个问题');
    expect(host.textContent).not.toContain('第一个问题');
    expect(host.textContent).toContain('2 / 2');

    clickOption(host, '选项 C');
    await nextTick();
    findButton(host, '提交').click();
    await nextTick();

    expect(answers).toEqual([
      { questionId: 'q1', selectedOptionIds: ['a'] },
      { questionId: 'q2', selectedOptionIds: ['c'] }
    ]);
  });

  it('jumps back to the first unanswered required question on submit', async () => {
    const answers: AskUserAnswer[] = [];
    const host = mount((value) => answers.push(...value));
    await nextTick();

    // 第一题不选，直接下一题并提交，应跳回第一题而不是提交
    findButton(host, '下一题').click();
    await nextTick();
    clickOption(host, '选项 C');
    await nextTick();
    findButton(host, '提交').click();
    await nextTick();

    expect(answers).toHaveLength(0);
    expect(host.textContent).toContain('第一个问题');
    expect(host.textContent).toContain('请完成必答项');
  });

  it('advances to the next question without selecting an answer', async () => {
    const host = mount(() => undefined);
    await nextTick();

    // 未选择也能用「下一题」前进；必答校验只在最终提交时触发
    findButton(host, '下一题').click();
    await nextTick();

    expect(host.textContent).toContain('第二个问题');
    expect(host.textContent).toContain('2 / 2');
  });

  it('navigates back with the previous button', async () => {
    const host = mount(() => undefined);
    await nextTick();

    expect(findButton(host, '上一题').disabled).toBe(true);
    findButton(host, '下一题').click();
    await nextTick();

    const prev = findButton(host, '上一题');
    expect(prev.disabled).toBe(false);
    prev.click();
    await nextTick();

    expect(host.textContent).toContain('第一个问题');
    expect(host.textContent).toContain('1 / 2');
  });
});
