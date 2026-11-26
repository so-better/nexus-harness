<template>
  <NConfigProvider :theme="theme" :theme-overrides="overrides" :locale="zhCN" :date-locale="dateZhCN">
    <NMessageProvider>
      <NDialogProvider>
        <div class="preview">
          <aside class="preview__list">
            <button
              v-for="item in modals"
              :key="item.key"
              type="button"
              class="preview__item"
              :class="{ 'preview__item--active': active === item.key }"
              @click="active = item.key"
            >
              {{ item.label }}
            </button>
            <button type="button" class="preview__item" @click="active = null">关闭全部</button>
            <button type="button" class="preview__item" @click="toggleMode">
              切换主题（当前 {{ mode }}）
            </button>
          </aside>
          <main class="preview__stage">
            <p v-if="active !== 'chat'" class="preview__hint">
              点击左侧打开真实弹窗，确认主体滚动与标题/底部固定。
            </p>
            <div v-else class="preview__chat">
              <ChatMessageItem
                v-for="message in chatMessages"
                :key="message.id"
                :message="message"
                session-id="preview-session"
              />
            </div>
          </main>

          <CommandPalette
            :show="active === 'command'"
            :commands="commands"
            @update:show="onShow('command', $event)"
            @select="() => {}"
          />
          <ChangelogModal :show="active === 'changelog'" @update:show="onShow('changelog', $event)" />
          <FilePreviewModal
            :show="active === 'file'"
            :file="previewFile"
            @update:show="onShow('file', $event)"
          />
          <SubagentTranscriptModal
            :show="active === 'transcript'"
            session-id="preview-session"
            artifact-id="artifact-1"
            @update:show="onShow('transcript', $event)"
          />
          <KnowledgeModal :show="active === 'knowledge'" @update:show="onShow('knowledge', $event)" />
          <ExtensionsModal :show="active === 'extensions'" @update:show="onShow('extensions', $event)" />
          <SettingsModal
            :show="active === 'settings'"
            version="0.0.1-preview"
            :busy="false"
            @update:show="onShow('settings', $event)"
          />
        </div>
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  NConfigProvider,
  NDialogProvider,
  NMessageProvider,
  darkTheme,
  dateZhCN,
  zhCN
} from 'naive-ui';
import { applyPalette, getNaiveOverrides, getPalette } from '@/app/theme-palette';
import type { PaletteCommand } from '@/app/commands';
import type { OutputFile } from '@shared/ipc/contracts';
import type { NexusEvent } from '@shared/events';
import { projectEvents } from '@/modules/chat/projection';
import ChatMessageItem from '@/modules/chat/components/ChatMessageItem.vue';
import CommandPalette from '@/components/CommandPalette.vue';
import ChangelogModal from '@/components/ChangelogModal.vue';
import FilePreviewModal from '@/modules/chat/components/FilePreviewModal.vue';
import SubagentTranscriptModal from '@/modules/chat/components/SubagentTranscriptModal.vue';
import KnowledgeModal from '@/modules/knowledge/views/KnowledgeModal.vue';
import ExtensionsModal from '@/plugin-runtime/components/ExtensionsModal.vue';
import SettingsModal from '@/modules/settings/views/SettingsModal.vue';

const mode = ref<'light' | 'dark'>('light');
const theme = computed(() => (mode.value === 'dark' ? darkTheme : null));
const overrides = computed(() => getNaiveOverrides(getPalette(mode.value)));

watch(
  mode,
  (value) => {
    // 与真实应用一致：写入 --nh-* 颜色语义变量并同步 data-theme
    applyPalette(getPalette(value));
    document.documentElement.setAttribute('data-theme', value);
    document.documentElement.style.colorScheme = value;
  },
  { immediate: true }
);

const active = ref<string | null>('settings');
const onShow = (key: string, value: boolean): void => {
  if (!value && active.value === key) active.value = null;
};
const toggleMode = (): void => {
  mode.value = mode.value === 'dark' ? 'light' : 'dark';
};

const modals = [
  { key: 'chat', label: '对话（子代理入口）' },
  { key: 'settings', label: '设置弹窗' },
  { key: 'extensions', label: '扩展弹窗' },
  { key: 'knowledge', label: '知识库弹窗' },
  { key: 'command', label: '命令面板' },
  { key: 'changelog', label: '更新日志' },
  { key: 'file', label: '文件预览' },
  { key: 'transcript', label: '子代理过程' }
];

const commands = Array.from({ length: 40 }, (_, index): PaletteCommand => ({
  id: `cmd-${index}`,
  title: `示例命令 ${index + 1}`,
  source: index % 2 === 0 ? '工作区' : '编辑器',
  icon: 'spark',
  ...(index % 3 === 0 ? { shortcut: 'Cmd+K' } : {})
}));

const previewFile: OutputFile = {
  id: 'file-1',
  sessionId: 'preview-session',
  name: 'report.md',
  mime: 'text/markdown',
  bytes: 12345,
  source: 'generated',
  createdAt: Date.now()
};

/**
 * 含子代理的对话：用真实事件投影 + ChatMessageItem 渲染，
 * 使 `task` 工具卡里的「查看子代理过程」入口出现在真实上下文中。
 */
let chatSeq = 0;
const chatEvent = (type: NexusEvent['type'], payload: unknown): NexusEvent =>
  ({
    id: `chat-${++chatSeq}`,
    sessionId: 'preview-session',
    runId: 'preview-run',
    seq: chatSeq,
    type,
    version: 1,
    ts: Date.now() + chatSeq,
    payload
  }) as NexusEvent;

const chatEvents: NexusEvent[] = [
  chatEvent('message.completed', {
    messageId: 'u1',
    role: 'user',
    content: '帮我调研 nexus 的上下文压缩实现。'
  }),
  chatEvent('tool.requested', {
    toolCallId: 'task-1',
    name: 'task',
    input: { agent: 'explore', description: '调研上下文压缩', prompt: '调研上下文压缩实现' }
  }),
  chatEvent('subagent.started', {
    parentToolCallId: 'task-1',
    agent: 'explore',
    description: '调研上下文压缩'
  }),
  chatEvent('subagent.progress', { parentToolCallId: 'task-1', name: 'read_file', ok: true }),
  chatEvent('subagent.progress', { parentToolCallId: 'task-1', name: 'grep', ok: true }),
  chatEvent('subagent.completed', {
    parentToolCallId: 'task-1',
    agent: 'explore',
    ok: true,
    summary: '压缩逻辑在 context-service 中实现，超预算时摘要较早轮次。',
    steps: 3,
    toolCalls: 5,
    transcripts: [{ index: 0, ref: 'artifact-1' }]
  }),
  chatEvent('tool.completed', { toolCallId: 'task-1', ok: true, output: '子代理结论：见过程。' }),
  chatEvent('message.completed', {
    messageId: 'a1',
    role: 'assistant',
    content: '调研完成，见上方子代理过程。'
  })
];
const chatMessages = computed(() => projectEvents(chatEvents).messages);

</script>

<style scoped>
.preview {
  display: flex;
  height: 100vh;
  overflow-y: auto;
  background: var(--nh-color-bg-base);
}

.preview__list {
  display: flex;
  width: 220px;
  flex: none;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-right: 1px solid var(--nh-border-subtle);
  overflow-y: auto;
}

.preview__item {
  padding: 8px 10px;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 8px;
  background: transparent;
  color: var(--nh-color-text-primary);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.preview__item--active {
  border-color: var(--nh-color-accent);
  background: color-mix(in srgb, var(--nh-color-accent) 10%, transparent);
}

.preview__stage {
  flex: 1 1 auto;
  padding: 24px;
}

.preview__hint {
  margin: 0;
  color: var(--nh-color-text-secondary);
  font-size: 13px;
}

.preview__chat {
  display: flex;
  max-width: 820px;
  flex-direction: column;
  gap: 16px;
}
</style>
