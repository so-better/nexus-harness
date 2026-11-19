/**
 * 插槽注册表单元测试：位置过滤、注销与重名保护。
 */

import { describe, expect, it } from 'vitest';
import { PLUGIN_SLOT_LOCATIONS } from '@shared/plugin';
import { SlotRegistry, type SlotMount } from './slot-registry';

const mount: SlotMount = () => () => undefined;
const slotRegistryCount = (registry: SlotRegistry): number =>
  PLUGIN_SLOT_LOCATIONS.reduce((count, location) => count + registry.list(location).length, 0);

describe('SlotRegistry', () => {
  it('registers contributions by location', () => {
    const registry = new SlotRegistry();
    registry.register({
      pluginId: 'nexus.one',
      id: 'usage.inline',
      location: 'message.assistant.footer',
      mount
    });

    expect(registry.list('message.assistant.footer')).toHaveLength(1);
    expect(registry.list('message.user.footer')).toHaveLength(0);
  });

  it('unregisters contributions', () => {
    const registry = new SlotRegistry();
    const unregister = registry.register({
      pluginId: 'nexus.one',
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
      pluginId: 'nexus.one',
      id: 'usage.inline',
      location: 'message.assistant.footer' as const,
      mount
    };
    registry.register(contribution);

    expect(() => registry.register(contribution)).toThrowError();
  });

  it('accepts every declared slot location', () => {
    const registry = new SlotRegistry();
    for (const [index, location] of PLUGIN_SLOT_LOCATIONS.entries()) {
      registry.register({
        pluginId: 'nexus.all-slots',
        id: `slot-${index}`,
        location,
        mount
      });
    }
    expect(slotRegistryCount(registry)).toBe(PLUGIN_SLOT_LOCATIONS.length);
  });

  it('allows the same contribution id from different plugins', () => {
    const registry = new SlotRegistry();
    registry.register({
      pluginId: 'nexus.one',
      id: 'footer',
      location: 'message.assistant.footer',
      mount
    });
    registry.register({
      pluginId: 'nexus.two',
      id: 'footer',
      location: 'message.assistant.footer',
      mount
    });

    expect(registry.list('message.assistant.footer')).toHaveLength(2);
  });
});
