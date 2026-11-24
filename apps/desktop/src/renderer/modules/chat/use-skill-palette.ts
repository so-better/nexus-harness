/**
 * 斜杠 Skill 候选：整段输入为 /query 时检索 Skill，并处理键盘选择。
 */

import { ref, watch, type Ref } from 'vue';
import type { InputInst } from 'naive-ui';
import type { SkillSummary } from '@shared/skills';
import { listSkills } from './api/skills.api';

interface SkillPaletteOptions {
  /** 自定义选择行为；未提供时把 /id 写回输入框 */
  onChoose?: (skill: SkillSummary) => void;
  /** 返回 false 时把 / 当普通字符，不再打开候选 */
  enabled?: () => boolean;
}

export const useSkillPalette = (
  draft: Ref<string>,
  inputRef: Ref<InputInst | null>,
  options: SkillPaletteOptions = {}
) => {
  const open = ref(false);
  const items = ref<SkillSummary[]>([]);
  const activeIndex = ref(0);
  let request = 0;

  const evaluate = async (value: string): Promise<void> => {
    if (options.enabled && !options.enabled()) {
      open.value = false;
      return;
    }
    const match = /^\/([a-zA-Z0-9._-]*)$/.exec(value);
    if (!match) {
      open.value = false;
      return;
    }
    const query = (match[1] ?? '').toLowerCase();
    const current = ++request;
    try {
      const skills = await listSkills();
      if (current !== request) return;
      const filtered = skills
        .filter(
          (skill) =>
            !query ||
            skill.id.toLowerCase().includes(query) ||
            skill.name.toLowerCase().includes(query) ||
            skill.description.toLowerCase().includes(query) ||
            skill.tags.some((tag) => tag.toLowerCase().includes(query))
        )
        .sort((a, b) => {
          const aPrefix = a.id.toLowerCase().startsWith(query) ? 0 : 1;
          const bPrefix = b.id.toLowerCase().startsWith(query) ? 0 : 1;
          return aPrefix - bPrefix || a.id.localeCompare(b.id);
        });
      items.value = filtered.slice(0, 8);
      activeIndex.value = 0;
      open.value = items.value.length > 0;
    } catch {
      if (current !== request) return;
      items.value = [];
      open.value = false;
    }
  };

  watch(draft, (value) => {
    evaluate(value).catch((error: unknown) => {
      console.error('检索 Skill 失败', error);
    });
  });

  /** 移除已选 Skill 后按当前输入重新判断是否打开候选 */
  const refresh = (): void => {
    evaluate(draft.value).catch((error: unknown) => {
      console.error('检索 Skill 失败', error);
    });
  };

  const choose = (id: string): void => {
    const skill = items.value.find((item) => item.id === id);
    if (skill && options.onChoose) {
      options.onChoose(skill);
    } else {
      draft.value = `/${id} `;
    }
    open.value = false;
    inputRef.value?.focus();
  };

  /**
   * 处理斜杠候选的键盘导航；返回是否已消费事件。
   */
  const handleKeydown = (event: KeyboardEvent): boolean => {
    if (!open.value || !items.value.length) return false;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeIndex.value = (activeIndex.value + 1) % items.value.length;
      return true;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex.value = (activeIndex.value - 1 + items.value.length) % items.value.length;
      return true;
    }
    if (event.key === 'Enter' && !event.isComposing && !event.shiftKey) {
      event.preventDefault();
      const skill = items.value[activeIndex.value];
      if (skill) choose(skill.id);
      return true;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      open.value = false;
      return true;
    }
    return false;
  };

  return { open, items, activeIndex, choose, refresh, handleKeydown };
};
