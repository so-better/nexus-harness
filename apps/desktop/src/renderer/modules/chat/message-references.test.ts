/**
 * 用户消息文件引用解析测试。
 */

import { describe, expect, it } from 'vitest';
import { splitUserMessageReferences } from './message-references';

describe('splitUserMessageReferences', () => {
  it('separates line-based references from the message body', () => {
    const parts = splitUserMessageReferences(
      '请参考\n\n@/workspace/src/app.ts\n@/workspace/src/a b.ts'
    );

    expect(parts.text).toBe('请参考');
    expect(parts.references).toEqual([
      { path: '/workspace/src/app.ts', name: 'app.ts' },
      { path: '/workspace/src/a b.ts', name: 'a b.ts' }
    ]);
  });

  it('supports legacy space-separated references', () => {
    const parts = splitUserMessageReferences('看下这两个文件\n\n@/workspace/a.ts @/workspace/b.ts');

    expect(parts.text).toBe('看下这两个文件');
    expect(parts.references.map((file) => file.name)).toEqual(['a.ts', 'b.ts']);
  });

  it('keeps normal @ text untouched', () => {
    const parts = splitUserMessageReferences('请发给 @alice 看下');

    expect(parts.text).toBe('请发给 @alice 看下');
    expect(parts.references).toEqual([]);
  });
});
