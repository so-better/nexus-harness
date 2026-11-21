// @vitest-environment jsdom
vi.hoisted(() => {
  (window as unknown as { takeNexusBridge: () => object }).takeNexusBridge = () => ({});
});
/**
 * 消息编辑表单：初始化草稿、引用与保存事件。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import type { ChatMessageView } from '../types';
import ChatMessageEditForm from './ChatMessageEditForm.vue';

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

vi.mock('../use-skill-palette', async () => {
  const { ref } = await import('vue');
  return {
    useSkillPalette: () => ({
      open: ref(false),
      items: ref([]),
      activeIndex: ref(0),
      choose: vi.fn(),
      handleKeydown: vi.fn()
    })
  };
});

vi.mock('../use-composer-attachments', async () => {
  const { ref } = await import('vue');
  return {
    useComposerAttachments: () => ({
      attachments: ref([]),
      uploading: ref(false),
      addFiles: vi.fn(),
      remove: vi.fn(),
      detach: vi.fn(),
      clear: vi.fn(),
      setAttachments: vi.fn()
    })
  };
});

const message: ChatMessageView = {
  id: 'message-1',
  role: 'user',
  content: 'hello world',
  toolCalls: [],
  createdAt: 0
};

const flush = async (): Promise<void> => {
  await nextTick();
  await nextTick();
};

describe('ChatMessageEditForm', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('initializes the draft and emits the edited content', async () => {
    const save = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(ChatMessageEditForm, {
      message,
      sessionId: 'session-1',
      onSave: save
    });
    app.mount(host);
    await flush();

    expect(host.querySelector('textarea')?.value).toBe('hello world');
    const send = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('发送')
    );
    send?.click();
    await flush();
    expect(save).toHaveBeenCalledWith('hello world', undefined, undefined);
    app.unmount();
  });
});
