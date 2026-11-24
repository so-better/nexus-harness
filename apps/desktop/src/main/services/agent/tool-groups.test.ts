/**
 * 工具分组元信息测试：默认组、Plan 基线与 search_tools 契约。
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_TOOL_GROUPS, PLAN_TOOL_GROUPS, searchToolsInputSchema } from './tool-groups';

describe('tool-groups', () => {
  it('defaults to core only', () => {
    expect([...DEFAULT_TOOL_GROUPS]).toEqual(['core']);
  });

  it('uses read-only management groups as plan base', () => {
    expect([...PLAN_TOOL_GROUPS].sort()).toEqual(
      ['core', 'appearance', 'terminal', 'maintenance', 'extensions'].sort()
    );
  });

  it('validates search_tools input', () => {
    expect(searchToolsInputSchema.safeParse({ query: 'ppt' }).success).toBe(true);
    expect(searchToolsInputSchema.safeParse({ query: 'ppt', limit: 20 }).success).toBe(true);
    expect(searchToolsInputSchema.safeParse({ query: '' }).success).toBe(false);
    expect(searchToolsInputSchema.safeParse({ query: 'x', limit: 21 }).success).toBe(false);
  });
});
