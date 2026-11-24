// @vitest-environment jsdom
/**
 * Skill 标签：展示 skill-id 并支持移除。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from 'vue';
import SkillTag from './SkillTag.vue';

describe('SkillTag', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows the skill id, then emits remove', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const onRemove = vi.fn();
    const app = createApp(SkillTag, {
      id: 'fix-tests',
      title: '修复测试',
      removable: true,
      onRemove
    });
    app.mount(host);

    expect(host.textContent).toContain('fix-tests');
    expect(host.querySelector('.nh-skill-tag')?.getAttribute('title')).toBe('修复测试');
    expect(host.querySelector('.nh-skill-tag__id')?.textContent).toBe('fix-tests');

    host.querySelector<HTMLButtonElement>('.nh-skill-tag__remove')?.click();
    expect(onRemove).toHaveBeenCalledTimes(1);
    app.unmount();
  });
});
