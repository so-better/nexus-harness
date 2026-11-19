/**
 * Ask User 终态摘要测试：选项映射、多选、自由文本与兜底。
 */

import { describe, expect, it } from 'vitest';
import type { AskQuestion } from '@shared/ask-user';
import { buildAnswerSummary, joinQuestionTexts } from './ask-user-summary';

const single: AskQuestion = {
  id: 'scope',
  question: '需要同时更新文档吗？',
  options: [
    { id: 'yes', label: '一起更新' },
    { id: 'no', label: '只改代码' }
  ]
};

describe('buildAnswerSummary', () => {
  it('把选项 id 映射为文案', () => {
    expect(
      buildAnswerSummary([single], [{ questionId: 'scope', selectedOptionIds: ['yes'] }], '未选择')
    ).toEqual([{ questionId: 'scope', question: '需要同时更新文档吗？', answer: '一起更新' }]);
  });

  it('合并多选与自由文本', () => {
    const multiple: AskQuestion = {
      id: 'artifacts',
      question: '保留哪些产物？',
      multiple: true,
      options: [
        { id: 'tests', label: '测试报告' },
        { id: 'docs', label: '文档' }
      ]
    };
    expect(
      buildAnswerSummary(
        [multiple],
        [{ questionId: 'artifacts', selectedOptionIds: ['tests', 'docs'], text: '封面图' }],
        '未选择'
      )[0]?.answer
    ).toBe('测试报告、文档、封面图');
  });

  it('选项缺失时回退为原始 id', () => {
    expect(
      buildAnswerSummary(
        [single],
        [{ questionId: 'scope', selectedOptionIds: ['missing'] }],
        '未选择'
      )[0]?.answer
    ).toBe('missing');
  });

  it('没有答案时使用兜底文案', () => {
    expect(buildAnswerSummary([single], undefined, '未选择')[0]?.answer).toBe('未选择');
  });
});

describe('joinQuestionTexts', () => {
  it('用中文分号连接多个问题', () => {
    expect(
      joinQuestionTexts([
        { id: 'a', question: '问题一' },
        { id: 'b', question: '问题二' }
      ])
    ).toBe('问题一；问题二');
  });
});
