// @vitest-environment jsdom
vi.hoisted(() => {
  (window as unknown as { takeNexusBridge: () => object }).takeNexusBridge = () => ({});
});
/**
 * 输入区 Skill：选择后显示标签，发送时恢复显式 /skill-id 调用。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import type { SkillSummary } from '@shared/skills';

vi.mock('../use-composer-attachments', async () => {
  const { computed, ref } = await import('vue');
  return {
    useComposerAttachments: () => ({
      attachments: ref([]),
      uploading: ref(false),
      hasAttachments: computed(() => false),
      addFiles: vi.fn(),
      remove: vi.fn(),
      detach: vi.fn(),
      clear: vi.fn(),
      setAttachments: vi.fn()
    })
  };
});

vi.mock('../use-composer-references', async () => {
  const { ref } = await import('vue');
  return {
    useComposerReferences: (options: {
      draft: { value: string };
      send: (prompt: string) => void;
    }) => {
      const selectedReferences = ref([]);
      const send = (): void => {
        const prompt = options.draft.value.trim();
        if (!prompt) return;
        options.draft.value = '';
        options.send(prompt);
      };
      return { selectedReferences, addReference: vi.fn(), removeReference: vi.fn(), send };
    }
  };
});

vi.mock('../use-file-reference', async () => {
  const { ref } = await import('vue');
  return {
    useFileReference: () => ({
      references: ref([]),
      activeIndex: ref(0),
      searching: ref(false),
      open: ref(false),
      close: vi.fn(),
      select: vi.fn(),
      onKeydown: vi.fn()
    })
  };
});

vi.mock('../api/skills.api', () => ({
  listSkills: vi.fn()
}));

import { listSkills } from '../api/skills.api';
import ComposerBox from './ComposerBox.vue';

const listMock = vi.mocked(listSkills);
const skill: SkillSummary = {
  id: 'fix-tests',
  source: 'builtin',
  name: '修复测试',
  description: '定位并修复失败测试',
  tags: ['测试'],
  version: '1.0.0',
  requires: []
};

const flush = async (): Promise<void> => {
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
};

const mountComposer = (
  onSend: ReturnType<typeof vi.fn>
): { app: ReturnType<typeof createApp>; host: HTMLElement } => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp(ComposerBox, {
    disabled: false,
    running: false,
    roots: [],
    providers: [],
    models: [],
    mode: 'build',
    approvalPolicy: 'ask',
    ensureSession: async () => undefined,
    onSend
  });
  app.mount(host);
  return { app, host };
};

const chooseSkill = async (host: HTMLElement): Promise<void> => {
  const textarea = host.querySelector('textarea');
  if (!textarea) throw new Error('textarea missing');
  textarea.value = '/fix';
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  await flush();
  const item = document.querySelector('.nh-skill-palette__item');
  if (!item) throw new Error('skill palette missing');
  item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await flush();
};

describe('ComposerBox skill', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    listMock.mockReset();
  });

  it('sends a skill-only prompt as /skill-id', async () => {
    listMock.mockResolvedValue([skill]);
    const onSend = vi.fn();
    const { app, host } = mountComposer(onSend);
    await flush();

    await chooseSkill(host);
    expect(host.querySelector('.nh-skill-tag')?.textContent).toContain('fix-tests');

    host
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    expect(onSend).toHaveBeenCalledWith('/fix-tests', undefined, undefined, []);
    expect(host.querySelector('.nh-skill-tag')).toBeNull();
    app.unmount();
  });

  it('treats slash as ordinary text after choosing a skill', async () => {
    listMock.mockResolvedValue([skill]);
    const onSend = vi.fn();
    const { app, host } = mountComposer(onSend);
    await flush();

    await chooseSkill(host);
    const textarea = host.querySelector('textarea');
    if (!textarea) throw new Error('textarea missing');
    textarea.value = '/';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();

    expect(host.querySelector('.nh-skill-tag')).not.toBeNull();
    host
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(onSend).toHaveBeenCalledWith('/fix-tests /', undefined, undefined, []);
    app.unmount();
  });

  it('keeps the prompt after the selected skill prefix', async () => {
    listMock.mockResolvedValue([skill]);
    const onSend = vi.fn();
    const { app, host } = mountComposer(onSend);
    await flush();

    await chooseSkill(host);
    const textarea = host.querySelector('textarea');
    if (!textarea) throw new Error('textarea missing');
    textarea.value = '帮我修复';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();

    host
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    expect(onSend).toHaveBeenCalledWith('/fix-tests 帮我修复', undefined, undefined, []);
    app.unmount();
  });
});
