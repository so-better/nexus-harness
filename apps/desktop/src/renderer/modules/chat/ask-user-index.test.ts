/**
 * Ask User 卡片索引测试：多提问与同消息覆盖。
 */

import { describe, expect, it } from 'vitest';
import type { ChatAskUser } from './types';
import { indexAskUsersByMessage } from './ask-user-index';

const ask = (requestId: string, messageId: string): ChatAskUser => ({
  requestId,
  messageId,
  questions: [],
  status: 'resolved'
});

describe('indexAskUsersByMessage', () => {
  it('maps all asks to their messages in order', () => {
    const first = ask('ask-1', 'message-1');
    const second = ask('ask-2', 'message-1');
    const other = ask('ask-3', 'message-2');
    const result = indexAskUsersByMessage([first, second, other]);

    expect(result.get('message-1')).toEqual([first, second]);
    expect(result.get('message-2')).toEqual([other]);
    expect(result.size).toBe(2);
  });

  it('ignores asks without a message id', () => {
    const result = indexAskUsersByMessage([
      { requestId: 'ask-1', questions: [], status: 'pending' }
    ]);

    expect(result.size).toBe(0);
  });
});
