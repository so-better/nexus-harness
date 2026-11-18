<template>
  <div class="nh-layout">
    <div class="nh-layout__body" :class="{ 'nh-layout__body--inspector': changesOpen }">
      <SessionSidebar
        :sessions="sessions.sessions"
        :active-id="sessions.activeId"
        :loading="sessions.loading"
        @create="createSession"
        @select="selectSession"
        @remove="removeSession"
        @rename="renameSession"
        @clear-all="clearAllSessions"
        @open-message="openSearchMessage"
        @toggle-pin="sessions.togglePinned"
      />

      <ChatView
        :session="sessions.activeSession"
        :projection="projection"
        :roots="roots"
        :providers="providers"
        :models="models"
        :mode="activeMode"
        :provider-id="providerId"
        :model-id="modelId"
        :disabled-reason="disabledReason"
        :focus-message-id="focusMessage?.id"
        :focus-token="focusMessage?.token"
        :focus-session-id="focusMessage?.sessionId"
        @choose-root="chooseRoot"
        @remove-root="removeRoot"
        @request-root="authorizeRootAndRetry"
        @update-provider="updateProvider"
        @update-model="updateModel"
        @update-mode="changeMode"
        @open-settings="settingsOpen = true"
        @send="send"
        @stop="stop"
        @approve="(id) => chat.decideApproval(id, true)"
        @reject="(id) => chat.decideApproval(id, false)"
        @answer-user="answerUser"
        @edit-message="editMessage"
        @regenerate-message="regenerateMessage"
        @toggle-changes="changesOpen = !changesOpen"
      />

      <ChangeReviewPanel
        v-if="changesOpen"
        :changes="projection.changes"
        :session-id="activeId"
        @close="changesOpen = false"
        @open-file="openFile"
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

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useMessage } from 'naive-ui';
import { storeToRefs } from 'pinia';
import type { AgentMode, ProviderPublic, SessionSummary } from '@shared/ipc/contracts';
import type { AskUserAnswer } from '@shared/ask-user';
import { setLocale, t } from '@/app/i18n';
import ChatView from '@/modules/chat/views/ChatView.vue';
import ChangeReviewPanel from '@/modules/chat/components/ChangeReviewPanel.vue';
import { openCheckpointFile } from '@/modules/chat/api/checkpoint.api';
import { projectEvents } from '@/modules/chat/projection';
import { useChatStore } from '@/modules/chat/stores/chat.store';
import SessionSidebar from '@/modules/session/components/SessionSidebar.vue';
import { subscribeSessionChanges } from '@/modules/session/api/session.api';
import { useSessionStore } from '@/modules/session/stores/session.store';
import { getLanguage } from '@/modules/settings/api/settings.api';
import SettingsModal from '@/modules/settings/views/SettingsModal.vue';
import AppStatusbar from './AppStatusbar.vue';
import { useAppMeta } from './use-app-meta';
import { useSessionStatusSync } from './use-session-status';

const sessions = useSessionStore();
const chat = useChatStore();
const message = useMessage();
const { sessions: sessionList, activeId } = storeToRefs(sessions);
const { providers, providerId, modelId, models, roots, runningBySession } = storeToRefs(chat);

const { version, settingsOpen, themeSource, load: loadAppMeta, setTheme } = useAppMeta();
const focusMessage = ref<{ id: string; token: number; sessionId: string }>();
const changesOpen = ref(false);
let unsubscribeSessionChanges: (() => void) | undefined;
let focusSequence = 0;

const activeMode = computed(
  () => sessionList.value.find((session) => session.id === activeId.value)?.mode ?? 'build'
);

const projection = computed(() => {
  const id = activeId.value;
  return projectEvents(id ? (chat.eventsBySession[id] ?? []) : []);
});

const runningCount = computed(() => Object.values(runningBySession.value).filter(Boolean).length);
const activeRunning = computed(() =>
  activeId.value ? Boolean(runningBySession.value[activeId.value]) : false
);
const disabledReason = computed(() => {
  if (!providerId.value) return t('chat.needsProvider');
  if (!modelId.value) return t('chat.needsModel');
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
    await chat.loadRoots(id);
    await chat.loadHistory(id);
    const sessionProvider = sessionList.value.find(
      (session: SessionSummary) => session.id === id
    )?.providerId;
    if (
      sessionProvider &&
      providers.value.some((provider: ProviderPublic) => provider.id === sessionProvider)
    ) {
      chat.setProvider(sessionProvider);
      const sessionModel = sessionList.value.find((session) => session.id === id)?.modelId;
      if (sessionModel && models.value.some((model) => model.id === sessionModel)) {
        chat.setModel(sessionModel);
      }
    }
  },
  { immediate: true }
);

/**
 * 新建会话并使用当前 Provider。
 */
const createSession = async (): Promise<void> => {
  const created = await sessions.create(providerId.value, modelId.value);
  if (!created) message.error(sessions.error ?? t('session.createFailed'));
};

/**
 * 选中会话。
 */
const selectSession = (id: string): void => {
  sessions.select(id);
};

/**
 * 用系统默认应用打开变更文件。
 */
const openFile = async (checkpointId: string): Promise<void> => {
  if (!activeId.value) return;
  try {
    await openCheckpointFile(activeId.value, checkpointId);
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('change.openFailed'));
  }
};

/**
 * 从跨会话搜索结果打开并定位消息。
 */
const openSearchMessage = (sessionId: string, messageId: string): void => {
  sessions.select(sessionId);
  focusSequence += 1;
  focusMessage.value = { id: messageId, token: focusSequence, sessionId };
};

/**
 * 没有会话时自动创建一个，保证始终有可进入的工作上下文。
 */
const ensureSession = async (): Promise<void> => {
  if (sessions.sessions.length === 0) {
    await sessions.create(providerId.value, modelId.value);
  }
};

/**
 * 删除会话；删掉最后一个后自动补一个新会话。
 */
const removeSession = async (id: string): Promise<void> => {
  const removed = await sessions.remove(id);
  if (!removed) {
    message.error(sessions.error ?? t('session.removeFailed'));
    return;
  }
  await ensureSession();
};

/**
 * 重命名会话。
 */
const renameSession = async (id: string, title: string): Promise<void> => {
  const renamed = await sessions.rename(id, title);
  if (!renamed) message.error(sessions.error ?? t('session.renameFailed'));
};

/**
 * 清除全部会话；完成后自动进入一个新会话。
 */
const clearAllSessions = async (): Promise<void> => {
  const cleared = await sessions.clearAll();
  if (!cleared) {
    message.error(sessions.error ?? t('session.clearAllFailed'));
    return;
  }
  await ensureSession();
};

/**
 * 添加工作区；没有会话时先创建。
 */
const authorizeWorkspace = async (): Promise<boolean> => {
  if (!activeId.value) {
    const created = await sessions.create(providerId.value, modelId.value);
    if (!created) {
      message.error(sessions.error ?? t('session.createFailed'));
      return false;
    }
  }
  if (!activeId.value) return false;

  const result = await chat.addRoot(activeId.value);
  if (result === 'failed') {
    message.error(chat.error ?? t('app.rootAddFailed'));
    return false;
  }
  return result === 'added';
};

/**
 * 从工具错误授权工作区，并提示用户重试原操作。
 */
const authorizeRootAndRetry = async (): Promise<void> => {
  if (await authorizeWorkspace()) message.info(t('app.rootAuthorizedRetry'));
};

/**
 * 添加或替换工作区。
 */
const chooseRoot = async (): Promise<void> => {
  await authorizeWorkspace();
};

/**
 * 清除当前会话的工作区授权。
 */
const removeRoot = async (rootId: string): Promise<void> => {
  if (!activeId.value) return;
  const removed = await chat.removeRoot(activeId.value, rootId);
  if (!removed) message.error(chat.error ?? t('app.rootRemoveFailed'));
};

/**
 * 发送消息；没有会话时先创建。
 */
const send = async (prompt: string, imagePaths?: string[]): Promise<void> => {
  if (!activeId.value) {
    const created = await sessions.create(providerId.value, modelId.value);
    if (!created) {
      message.error(sessions.error ?? t('session.createFailed'));
      return;
    }
  }
  if (activeId.value) {
    const started = await chat.send(activeId.value, prompt, imagePaths);
    if (!started) message.error(chat.error ?? t('chat.sendFailed'));
  }
};

/**
 * 持久化当前会话的服务商与模型选择。
 */
const persistSelection = (): void => {
  if (activeId.value && providerId.value && modelId.value) {
    sessions
      .updateModel(activeId.value, providerId.value, modelId.value)
      .catch((error: unknown) => console.error('保存会话模型失败', error));
  }
};

/**
 * 切换服务商并持久化。
 */
const updateProvider = (id: string): void => {
  chat.setProvider(id);
  persistSelection();
};

/**
 * 切换模型并持久化。
 */
const updateModel = (id: string): void => {
  chat.setModel(id);
  persistSelection();
};

/**
 * 回答 Agent 的结构化提问。
 */
const answerUser = async (
  requestId: string,
  answers: AskUserAnswer[] | undefined
): Promise<void> => {
  const answered = await chat.answerAskUser(requestId, answers);
  if (!answered) message.error(chat.error ?? t('chat.askUserFailed'));
};

/**
 * 编辑用户消息并重发。
 */
const editMessage = async (messageId: string, content: string): Promise<void> => {
  if (!activeId.value || activeRunning.value) return;
  const started = await chat.editMessage(activeId.value, messageId, content);
  if (!started) message.error(chat.error ?? t('chat.editFailed'));
};

/**
 * 重新生成最后一条助手回复。
 */
const regenerateMessage = async (messageId: string): Promise<void> => {
  if (!activeId.value || activeRunning.value) return;
  const prompt = [...projection.value.messages]
    .reverse()
    .find((message) => message.role === 'user')?.content;
  if (!prompt) return;
  const started = await chat.regenerateMessage(activeId.value, messageId, prompt);
  if (!started) message.error(chat.error ?? t('chat.regenerateFailed'));
};

/**
 * 切换 Agent 模式；运行中禁止切换。
 */
const changeMode = async (mode: AgentMode): Promise<void> => {
  if (!activeId.value || activeRunning.value) return;
  const updated = await sessions.updateMode(activeId.value, mode);
  if (!updated) message.error(sessions.error ?? t('chat.modeChangeFailed'));
};

/**
 * 停止当前会话的 Run。
 */
const stop = async (): Promise<void> => {
  if (activeId.value) await chat.stop(activeId.value);
};

onMounted(async () => {
  unsubscribeSessionChanges = subscribeSessionChanges((session) => sessions.applyUpdate(session));
  try {
    setLocale(await getLanguage());
  } catch {
    // 语言读取失败时保持默认中文
  }
  await chat.initialize();
  await sessions.load();
  await ensureSession();
  await loadAppMeta();
});

onBeforeUnmount(() => {
  unsubscribeSessionChanges?.();
  unsubscribeSessionChanges = undefined;
  chat.dispose();
});
</script>

<style scoped lang="less">
.nh-layout {
  display: grid;
  height: 100%;
  overflow: hidden;
  grid-template-rows: minmax(0, 1fr) 44px;
  background: var(--nh-color-bg-base);
}

.nh-layout__body {
  display: grid;
  min-height: 0;
  overflow: hidden;
  grid-template-columns: 288px minmax(0, 1fr);
}

.nh-layout__body--inspector {
  grid-template-columns: 288px minmax(0, 1fr) 520px;
}

@media (width <= 1024px) {
  .nh-layout__body {
    grid-template-columns: 268px minmax(0, 1fr);
  }

  .nh-layout__body--inspector {
    grid-template-columns: 268px minmax(0, 1fr) 460px;
  }
}
</style>
