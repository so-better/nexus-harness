<template>
  <div class="nh-layout">
    <div class="nh-layout__body">
      <SessionSidebar
        :sessions="sessions.sessions"
        :active-id="sessions.activeId"
        :loading="sessions.loading"
        @create="createSession"
        @select="selectSession"
        @remove="sessions.remove"
        @toggle-pin="sessions.togglePinned"
      />

      <ChatView
        :session="sessions.activeSession"
        :projection="projection"
        :root-label="rootLabel"
        :providers="providers"
        :provider-id="providerId"
        :disabled-reason="disabledReason"
        @choose-root="chat.addRoot"
        @update-provider="chat.setProvider"
        @open-settings="settingsOpen = true"
        @send="send"
        @stop="stop"
        @approve="(id) => chat.decideApproval(id, true)"
        @reject="(id) => chat.decideApproval(id, false)"
      />
    </div>

    <AppStatusbar
      :theme-source="themeSource"
      :version="version"
      @update-theme="setTheme"
      @open-settings="settingsOpen = true"
    />

    <SettingsModal
      :show="settingsOpen"
      :version="version"
      :busy="runningCount > 0"
      @update:show="settingsOpen = $event"
      @changed="chat.refreshProviders"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * 主布局容器：协调会话、聊天状态、Provider、设置与临时工作目录。
 */

import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { storeToRefs } from 'pinia';
import type { ProviderPublic, SessionSummary } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import ChatView from '@/modules/chat/views/ChatView.vue';
import { projectEvents } from '@/modules/chat/projection';
import { useChatStore } from '@/modules/chat/stores/chat.store';
import SessionSidebar from '@/modules/session/components/SessionSidebar.vue';
import { useSessionStore } from '@/modules/session/stores/session.store';
import SettingsModal from '@/modules/settings/views/SettingsModal.vue';
import AppStatusbar from './AppStatusbar.vue';
import { useAppMeta } from './use-app-meta';
import { useSessionStatusSync } from './use-session-status';

const sessions = useSessionStore();
const chat = useChatStore();
const { sessions: sessionList, activeId } = storeToRefs(sessions);
const { providers, providerId, rootPaths, runningBySession } = storeToRefs(chat);

const { version, settingsOpen, themeSource, load: loadAppMeta, setTheme } = useAppMeta();

const projection = computed(() => {
  const id = activeId.value;
  return projectEvents(id ? (chat.eventsBySession[id] ?? []) : []);
});

const runningCount = computed(() => Object.values(runningBySession.value).filter(Boolean).length);
const rootLabel = computed(() =>
  rootPaths.value.length ? `${t('app.workspace')} · ${rootPaths.value.length}` : t('app.noRoot')
);
const disabledReason = computed(() => {
  if (!providerId.value) return t('chat.needsProvider');
  if (rootPaths.value.length === 0) return t('chat.needsRoot');
  return undefined;
});
useSessionStatusSync(sessions, projection, activeId);

/**
 * 切换会话时读取历史，并优先使用会话保存的 Provider。
 */
watch(
  activeId,
  async (id) => {
    if (!id) return;
    await chat.loadHistory(id);
    const sessionProvider = sessionList.value.find(
      (session: SessionSummary) => session.id === id
    )?.providerId;
    if (
      sessionProvider &&
      providers.value.some((provider: ProviderPublic) => provider.id === sessionProvider)
    ) {
      chat.setProvider(sessionProvider);
    }
  },
  { immediate: true }
);

/**
 * 新建会话并使用当前 Provider。
 */
const createSession = async (): Promise<void> => {
  await sessions.create(providerId.value);
};

/**
 * 选中会话。
 */
const selectSession = (id: string): void => {
  sessions.select(id);
};

/**
 * 发送消息；没有会话时先创建。
 */
const send = async (prompt: string): Promise<void> => {
  if (!activeId.value) {
    const created = await sessions.create(providerId.value);
    if (!created) return;
  }
  if (activeId.value) await chat.send(activeId.value, prompt);
};

/**
 * 停止当前会话的 Run。
 */
const stop = async (): Promise<void> => {
  if (activeId.value) await chat.stop(activeId.value);
};

onMounted(async () => {
  await chat.initialize();
  await sessions.load();
  await loadAppMeta();
});

onBeforeUnmount(() => {
  chat.dispose();
});
</script>

<style scoped lang="less">
.nh-layout {
  display: grid;
  height: 100%;
  grid-template-rows: minmax(0, 1fr) 44px;
  background: var(--nh-color-bg-base);
}

.nh-layout__body {
  display: grid;
  min-height: 0;
  grid-template-columns: 264px minmax(0, 1fr);
}

@media (width <= 1024px) {
  .nh-layout__body {
    grid-template-columns: 240px minmax(0, 1fr);
  }
}
</style>
