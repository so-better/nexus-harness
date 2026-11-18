/**
 * Ask User 队列测试：窗口隔离与 Run 取消。
 */

import { describe, expect, it } from 'vitest';
import { AskUserService } from './ask-user-service';

describe('AskUserService', () => {
  it('only lets the requesting window answer', async () => {
    const service = new AskUserService();
    const pending = service.request('question-1', 'run-1', 1);
    const answers = [{ questionId: 'q1', selectedOptionIds: ['a'] }];

    expect(service.resolve('question-1', answers, 2)).toBe(false);
    expect(service.resolve('question-1', answers, 1)).toBe(true);
    await expect(pending).resolves.toEqual(answers);
  });

  it('resolves cancellation with undefined', async () => {
    const service = new AskUserService();
    const pending = service.request('question-1', 'run-1', 1);

    expect(service.resolve('question-1', undefined, 1)).toBe(true);
    await expect(pending).resolves.toBeUndefined();
  });

  it('cancels pending questions when a run is cancelled', async () => {
    const service = new AskUserService();
    const pending = service.request('question-1', 'run-1', 1);

    service.cancelRun('run-1');
    await expect(pending).resolves.toBeUndefined();
  });
});
