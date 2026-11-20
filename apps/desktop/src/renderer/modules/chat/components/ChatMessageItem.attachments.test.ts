// @vitest-environment jsdom
/**
 * 用户消息附件渲染：纯附件消息也必须显示消息体与编辑入口。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  (window as unknown as { takeNexusBridge: () => object }).takeNexusBridge = () => ({});
});
import { createApp, defineComponent, h, nextTick } from 'vue';
import { NMessageProvider } from 'naive-ui';
import type { ChatMessageView } from '../types';

vi.mock('@/plugin-runtime/components/PluginSlot.vue', () => ({
  default: { name: 'PluginSlotStub', template: '<div class="plugin-slot-stub" />' }
}));

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

vi.mock('../api/attachments.api', () => ({
  uploadAttachment: vi.fn(),
  removeAttachment: vi.fn(),
  readAttachmentImage: vi.fn().mockRejectedValue(new Error('no preview'))
}));

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

import ChatMessageItem from './ChatMessageItem.vue';
import { removeAttachment } from '../api/attachments.api';

const attachment = {
  id: 'attachment-1',
  sessionId: 'session-1',
  name: 'notes.txt',
  mime: 'text/plain',
  bytes: 12,
  createdAt: 0
};

const message: ChatMessageView = {
  id: 'message-1',
  role: 'user',
  content: '',
  toolCalls: [],
  createdAt: 0,
  attachments: [attachment]
};

describe('ChatMessageItem attachment-only messages', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the message and enables editing when only attachments exist', async () => {
    const Wrapper = defineComponent({
      setup() {
        return () =>
          h(NMessageProvider, null, {
            default: () => h(ChatMessageItem, { message, sessionId: 'session-1' })
          });
      }
    });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(Wrapper);
    app.mount(host);
    await nextTick();

    expect(host.querySelector('.nh-message')).not.toBeNull();
    expect(host.textContent).toContain('notes.txt');
    expect(host.textContent).toContain('编辑');
    app.unmount();
  });

  it('removes an existing attachment from the edit draft without deleting storage', async () => {
    const Wrapper = defineComponent({
      setup() {
        return () =>
          h(NMessageProvider, null, {
            default: () => h(ChatMessageItem, { message, sessionId: 'session-1' })
          });
      }
    });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(Wrapper);
    app.mount(host);
    await nextTick();

    const editButton = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('编辑')
    );
    editButton?.click();
    await nextTick();
    expect(host.querySelector('.nh-message__edit-files .nh-file-chip__name')?.textContent).toBe(
      'notes.txt'
    );

    host.querySelector('.nh-message__edit-files .nh-file-chip__remove')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    await nextTick();
    expect(removeAttachment).not.toHaveBeenCalled();
    app.unmount();
  });
});
