/**
 * 插槽注册表单元测试：位置过滤、注销与重名保护。
 */

import { describe, expect, it } from 'vitest';
import { SlotRegistry, type SlotMount } from './slot-registry';

const mount: SlotMount = () => () => undefined;

describe('SlotRegistry', () => {
  it('registers contributions by location', () => {
    const registry = new SlotRegistry();
    registry.register({ id: 'usage.inline', location: 'message.assistant.footer', mount });

    expect(registry.list('message.assistant.footer')).toHaveLength(1);
    expect(registry.list('message.user.footer')).toHaveLength(0);
  });

  it('unregisters contributions', () => {
    const registry = new SlotRegistry();
    const unregister = registry.register({
      id: 'usage.inline',
      location: 'message.assistant.footer',
      mount
    });

    unregister();
    expect(registry.list('message.assistant.footer')).toHaveLength(0);
  });

  it('rejects duplicate contributions in the same location', () => {
    const registry = new SlotRegistry();
    const contribution = {
      id: 'usage.inline',
      location: 'message.assistant.footer' as const,
      mount
    };
    registry.register(contribution);

    expect(() => registry.register(contribution)).toThrowError();
  });
});
