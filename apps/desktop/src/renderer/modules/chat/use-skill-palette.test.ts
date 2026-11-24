// @vitest-environment jsdom
/**
 * 斜杠 Skill 候选：验证默认写回 /id 与自定义选择回调。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { InputInst } from 'naive-ui';
import type { SkillSummary } from '@shared/skills';

vi.mock('./api/skills.api', () => ({
  listSkills: vi.fn()
}));

import { listSkills } from './api/skills.api';
import { useSkillPalette } from './use-skill-palette';

const listMock = vi.mocked(listSkills);
const skill: SkillSummary = {
  id: 'fix-tests',
  source: 'user',
  name: '修复测试',
  description: '定位并修复失败测试',
  tags: ['测试'],
  version: '1.0.0',
  requires: []
};

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('useSkillPalette', () => {
  afterEach(() => {
    listMock.mockReset();
  });

  it('writes /id back to the composer by default', async () => {
    listMock.mockResolvedValue([skill]);
    const draft = ref('');
    const focus = vi.fn();
    const palette = useSkillPalette(draft, ref({ focus } as unknown as InputInst));

    draft.value = '/fix';
    await flush();

    palette.choose('fix-tests');
    expect(draft.value).toBe('/fix-tests ');
    expect(focus).toHaveBeenCalled();
  });

  it('does not open the palette when disabled', async () => {
    listMock.mockResolvedValue([skill]);
    const draft = ref('');
    const palette = useSkillPalette(draft, ref({ focus: vi.fn() } as unknown as InputInst), {
      enabled: () => false
    });

    draft.value = '/fix';
    await flush();

    expect(palette.open.value).toBe(false);
    expect(palette.items.value).toEqual([]);
  });

  it('re-evaluates candidates after the previous skill is cleared', async () => {
    listMock.mockResolvedValue([skill]);
    const draft = ref('/fix');
    const enabled = ref(false);
    const palette = useSkillPalette(draft, ref({ focus: vi.fn() } as unknown as InputInst), {
      enabled: () => enabled.value
    });
    await flush();
    expect(palette.open.value).toBe(false);

    enabled.value = true;
    palette.refresh();
    await flush();
    expect(palette.open.value).toBe(true);
    expect(palette.items.value).toHaveLength(1);
  });

  it('lets the composer take ownership of the selected skill', async () => {
    listMock.mockResolvedValue([skill]);
    const draft = ref('');
    const focus = vi.fn();
    const onChoose = vi.fn(() => {
      draft.value = '';
    });
    const palette = useSkillPalette(draft, ref({ focus } as unknown as InputInst), { onChoose });

    draft.value = '/fix';
    await flush();

    palette.choose('fix-tests');
    expect(onChoose).toHaveBeenCalledWith(skill);
    expect(draft.value).toBe('');
    expect(focus).toHaveBeenCalled();
  });
});
