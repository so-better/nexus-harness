<template>
  <div class="nh-layout">
    <AppTitlebar
      :root-label="rootLabel"
      :provider-id="providerId"
      :providers="providers"
      @choose-root="chat.addRoot"
      @update-provider="chat.setProvider"
    />

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
        :provider-label="providerLabel"
        :disabled-reason="disabledReason"
        @send="send"
        @stop="stop"
        @approve="(id) => chat.decideApproval(id, true)"
        @reject="(id) => chat.decideApproval(id, false)"
      />

      <AppInspector class="nh-layout__inspector" :usage="projection.usage" :errors="errors" />
    </div>

    <AppStatusbar
      :running="running"
      :input-tokens="projection.usage.inputTokens"
      :output-tokens="projection.usage.outputTokens"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * 主布局容器：协调会话、聊天状态、Provider 与临时工作目录。
 */

import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { storeToRefs } from 'pinia';
import type { SessionStatus, SessionSummary } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import ChatView from '@/modules/chat/views/ChatView.vue';
import { projectEvents } from '@/modules/chat/projection';
import { useChatStore } from '@/modules/chat/stores/chat.store';
import SessionSidebar from '@/modules/session/components/SessionSidebar.vue';
import { useSessionStore } from '@/modules/session/stores/session.store';
import AppInspector from './AppInspector.vue';
import AppStatusbar from './AppStatusbar.vue';
import AppTitlebar from './AppTitlebar.vue';

const sessions = useSessionStore();
const chat = useChatStore();
const { sessions: sessionList, activeId } = storeToRefs(sessions);
const { providers, providerId, rootPaths, runningBySession, error } = storeToRefs(chat);

const projection = computed(() => {
  const id = activeId.value;
  return projectEvents(id ? (chat.eventsBySession[id] ?? []) : []);
});

const running = computed(() => Boolean(activeId.value && runningBySession.value[activeId.value]));
const providerLabel = computed(
  () => providers.value.find((provider) => provider.id === providerId.value)?.name ?? ''
);
const rootLabel = computed(() =>
  rootPaths.value.length ? `${t('app.chooseRoot')} (${rootPaths.value.length})` : t('app.noRoot')
);
const disabledReason = computed(() => {
  if (!providerId.value) return t('chat.needsProvider');
  if (rootPaths.value.length === 0) return t('chat.needsRoot');
  return undefined;
});
const errors = computed(() =>
  [projection.value.error, error.value, sessions.error].filter((message): message is string =>
    Boolean(message)
  )
);

const statusMap: Record<string, SessionStatus> = {
  idle: 'idle',
  running: 'running',
  waiting_approval: 'waiting_approval',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'interrupted'
};

/**
 * 把投影状态同步到侧栏，保持运行状态可见。
 */
watch(
  () => projection.value.status,
  (status) => {
    if (activeId.value) sessions.setLocalStatus(activeId.value, statusMap[status] ?? 'idle');
  }
);

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
    if (sessionProvider && providers.value.some((provider) => provider.id === sessionProvider)) {
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

const selectSession = (id: string): void => {
  sessions.select(id);
};

const send = async (prompt: string): Promise<void> => {
  if (!activeId.value) {
    const created = await sessions.create(providerId.value);
    if (!created) return;
  }
  if (activeId.value) await chat.send(activeId.value, prompt);
};

const stop = async (): Promise<void> => {
  if (activeId.value) await chat.stop(activeId.value);
};

onMounted(async () => {
  await chat.initialize();
  await sessions.load();
});

onBeforeUnmount(() => {
  chat.dispose();
});
</script>

<style scoped lang="less">
.nh-layout {
  display: grid;
  height: 100%;
  grid-template-rows: 44px minmax(0, 1fr) 24px;
  background: var(--nh-color-bg-base);
}

.nh-layout__body {
  display: grid;
  min-height: 0;
  grid-template-columns: 240px minmax(0, 1fr) 240px;
}

@media (width <= 1100px) {
  .nh-layout__body {
    grid-template-columns: 220px minmax(0, 1fr);
  }

  .nh-layout__inspector {
    display: none;
  }
}
</style>
