<template>
  <div
    class="nh-layout"
    :class="{ 'nh-layout--skin': Boolean(pluginRuntime.activeSkinMount) }"
    :style="{ '--nh-rail-w': railWidth }"
  >
    <PluginSkinLayer />
    <AppTitleBar :title="activeNavLabel" :platform="platform" />
    <div class="nh-layout__body">
      <NavRail
        :collapsed="railCollapsed"
        :active-id="activeSection"
        @select="activeSection = $event"
        @toggle="railCollapsed = !railCollapsed"
      />
      <SessionSidebar
        ref="sidebarRef"
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
        :running="activeRunning"
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
        :exporting="exporting"
        :workspace-auth="workspaceAuthRequest"
        :ensure-session="ensureSession"
        @choose-root="chooseRoot"
        @remove-root="removeRoot"
        @request-root="authorizeRootAndRetry"
        @allow-workspace="allowWorkspace"
        @reject-workspace="rejectWorkspace"
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
        @export="(format) => exportActiveSession(format)"
        @update-approval-policy="changeApprovalPolicy"
      />
      <TerminalPanel :session-id="activeId ?? undefined" :shortcut-enabled="!settingsOpen" />
    </div>

    <AppStatusbar
      :theme-source="themeSource"
      :version="version"
      :terminal-open="terminal.open"
      :session-id="activeId ?? undefined"
      @open-knowledge="knowledgeOpen = true"
      @open-extensions="extensionsOpen = true"
      @toggle-terminal="terminal.togglePanel"
      @update-theme="setTheme"
      @open-settings="settingsOpen = true"
      @open-changelog="changelogOpen = true"
    />

    <KnowledgeModal :show="knowledgeOpen" @update:show="knowledgeOpen = $event" />
    <ExtensionsModal :show="extensionsOpen" @update:show="extensionsOpen = $event" />
    <PluginViewModal />
    <ChangelogModal :show="changelogOpen" @update:show="changelogOpen = $event" />
    <CommandPalette
      v-model:show="commandPaletteOpen"
      :commands="paletteCommands"
      @select="executeCommand"
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

import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useDialog, useMessage } from 'naive-ui';
import { storeToRefs } from 'pinia';
import type { ApprovalPolicy, ProviderPublic, SessionSummary } from '@shared/ipc/contracts';
import { setLocale, t } from '@/app/i18n';
import { effectiveTheme } from '@/app/theme';
import ChatView from '@/modules/chat/views/ChatView.vue';
import {
  onWorkspaceAuthorization,
  onWorkspaceAuthorizationSettled
} from '@/modules/chat/api/workspace.api';
import { projectEvents } from '@/modules/chat/projection';
import { useChatStore } from '@/modules/chat/stores/chat.store';
import SessionSidebar from '@/modules/session/components/SessionSidebar.vue';
import {
  consumePendingSession,
  onSessionActivate,
  onSessionRootsChanged,
  subscribeSessionChanges
} from '@/modules/session/api/session.api';
import { useSessionStore } from '@/modules/session/stores/session.store';
import { getLanguage, onGeneralSettingsChanged } from '@/modules/settings/api/settings.api';
import SettingsModal from '@/modules/settings/views/SettingsModal.vue';
import { useTerminalStore } from '@/modules/terminal/stores/terminal.store';
import ExtensionsModal from '@/plugin-runtime/components/ExtensionsModal.vue';
import KnowledgeModal from '@/modules/knowledge/views/KnowledgeModal.vue';
import ChangelogModal from '@/components/ChangelogModal.vue';
import CommandPalette from '@/components/CommandPalette.vue';
import PluginSkinLayer from '@/plugin-runtime/components/PluginSkinLayer.vue';
import PluginViewModal from '@/plugin-runtime/components/PluginViewModal.vue';
import { setAppMessageApi } from '@/app/app-message';
import { usePluginRuntimeStore } from '@/plugin-runtime/runtime.store';
import AppStatusbar from './AppStatusbar.vue';
import AppTitleBar from './AppTitleBar.vue';
import NavRail from './NavRail.vue';
import { NAV_ITEMS } from './nav-items';
import { useAppMeta } from './use-app-meta';
import { useSessionStatusSync } from './use-session-status';
import { useAppCommands } from './use-app-commands';
import { useMainSessionActions } from './use-main-session-actions';
import { useMainChatActions } from './use-main-chat-actions';
import { useWorkspaceAuthorization } from './use-workspace-authorization';

const sessions = useSessionStore();
const chat = useChatStore();
const terminal = useTerminalStore();
const pluginRuntime = usePluginRuntimeStore();
const knowledgeOpen = ref(false);
const extensionsOpen = ref(false);
const changelogOpen = ref(false);
const sidebarRef = ref<{ openSearch: () => Promise<void> } | null>(null);
const TerminalPanel = defineAsyncComponent(
  () => import('@/modules/terminal/components/TerminalPanel.vue')
);
const message = useMessage();
setAppMessageApi(message);
const dialog = useDialog();
const { sessions: sessionList, activeId } = storeToRefs(sessions);
const { providers, providerId, modelId, models, roots, runningBySession } = storeToRefs(chat);

const { version, platform, settingsOpen, themeSource, load: loadAppMeta, setTheme } = useAppMeta();

const railCollapsed = ref(false);
// 收起时仅显示图标的窄栏，展开时容纳图标 + 名称
const railWidth = computed(() => (railCollapsed.value ? '80px' : '176px'));

// 当前导航区块，默认取菜单首项；标题栏副标题随之显示菜单名称
const activeSection = ref(NAV_ITEMS[0]?.id ?? '');
const activeNavLabel = computed(() => {
  const item = NAV_ITEMS.find((entry) => entry.id === activeSection.value);
  return t(item?.labelKey ?? 'nav.sessions');
});

watch(
  () => Boolean(pluginRuntime.activeSkinMount),
  (active) => {
    if (active) document.documentElement.dataset.skin = 'active';
    else delete document.documentElement.dataset.skin;
  },
  { immediate: true }
);
const {
  exporting,
  focusMessage,
  createSession,
  selectSession,
  openSearchMessage,
  ensureSession,
  removeSession,
  exportActiveSession,
  renameSession,
  clearAllSessions
} = useMainSessionActions();
let unsubscribeSessionChanges: (() => void) | undefined;
let unsubscribeSessionActivate: (() => void) | undefined;
let unsubscribeSessionRoots: (() => void) | undefined;
let unsubscribeWorkspaceAuth: (() => void) | undefined;
let unsubscribeWorkspaceSettled: (() => void) | undefined;
let unsubscribeGeneralSettings: (() => void) | undefined;

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

const {
  workspaceAuthRequests,
  workspaceAuthRequest,
  authorizeRootAndRetry,
  chooseRoot,
  removeRoot,
  allowWorkspace,
  rejectWorkspace,
  clearWorkspaceRequest
} = useWorkspaceAuthorization();

/**
 * 切换会话审批策略；工作区信任必须有 workspace，始终信任需要二次确认。
 */
const changeApprovalPolicy = async (policy: ApprovalPolicy): Promise<void> => {
  if (!activeId.value) return;
  if (policy === 'workspace' && roots.value.length === 0) {
    message.warning(t('approval.workspaceRequired'));
    return;
  }
  if (policy === 'always') {
    dialog.warning({
      title: t('approval.alwaysConfirmTitle'),
      content: t('approval.alwaysConfirm'),
      positiveText: t('approval.enable'),
      negativeText: t('approval.cancel'),
      autoFocus: false,
      onPositiveClick: () => {
        if (!activeId.value) return;
        sessions.updateApprovalPolicy(activeId.value, 'always').then((updated) => {
          if (!updated) message.error(sessions.error ?? t('approval.workspaceRequired'));
        });
      }
    });
    return;
  }
  const updated = await sessions.updateApprovalPolicy(activeId.value, policy);
  if (!updated) message.error(sessions.error ?? t('approval.workspaceRequired'));
};

const {
  send,
  updateProvider,
  updateModel,
  answerUser,
  editMessage,
  regenerateMessage,
  changeMode,
  stop
} = useMainChatActions({ activeRunning, projection });

watch(activeId, (id) => pluginRuntime.setActiveSession(id), { immediate: true });

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

const { commandPaletteOpen, paletteCommands, executeCommand } = useAppCommands({
  pluginRuntime,
  activeRunning,
  sessions: sessionList,
  openSession: (id) => sessions.select(id),
  createSession,
  openSearch: () => sidebarRef.value?.openSearch(),
  openSettings: () => {
    settingsOpen.value = true;
  },
  openExtensions: () => {
    extensionsOpen.value = true;
  },
  openKnowledge: () => {
    knowledgeOpen.value = true;
  },
  toggleTerminal: () => terminal.togglePanel(),
  openChangelog: () => {
    changelogOpen.value = true;
  },
  toggleTheme: () => {
    setTheme(effectiveTheme.value === 'dark' ? 'light' : 'dark').catch((error: unknown) => {
      console.error('切换主题失败', error);
    });
  },
  stop,
  showError: (text) => message.error(text)
});

onMounted(async () => {
  terminal.init();
  await pluginRuntime.init();
  unsubscribeSessionChanges = subscribeSessionChanges((session) => sessions.applyUpdate(session));
  unsubscribeSessionActivate = onSessionActivate((sessionId) => sessions.select(sessionId));
  unsubscribeSessionRoots = onSessionRootsChanged((sessionId) => {
    if (sessionId === activeId.value) chat.loadRoots(sessionId).catch(() => undefined);
  });
  unsubscribeWorkspaceAuth = onWorkspaceAuthorization((request) => {
    workspaceAuthRequests.value = {
      ...workspaceAuthRequests.value,
      [request.sessionId]: request
    };
    if (
      request.sessionId !== activeId.value &&
      sessionList.value.some((session) => session.id === request.sessionId)
    ) {
      sessions.select(request.sessionId);
    }
  });
  unsubscribeGeneralSettings = onGeneralSettingsChanged((state) => {
    setLocale(state.language);
  });
  unsubscribeWorkspaceSettled = onWorkspaceAuthorizationSettled((settled) => {
    const entry = Object.entries(workspaceAuthRequests.value).find(
      ([, request]) => request.requestId === settled.requestId
    );
    if (entry) clearWorkspaceRequest(entry[0]);
  });
  try {
    setLocale(await getLanguage());
  } catch {
    // 语言读取失败时保持默认中文
  }
  await chat.initialize();
  await sessions.load();
  const pendingSession = await consumePendingSession();
  if (pendingSession) sessions.select(pendingSession);
  await ensureSession();
  await loadAppMeta();
});

onBeforeUnmount(() => {
  unsubscribeSessionChanges?.();
  unsubscribeSessionChanges = undefined;
  unsubscribeSessionActivate?.();
  unsubscribeSessionActivate = undefined;
  unsubscribeSessionRoots?.();
  unsubscribeSessionRoots = undefined;
  unsubscribeWorkspaceAuth?.();
  unsubscribeWorkspaceAuth = undefined;
  unsubscribeWorkspaceSettled?.();
  unsubscribeWorkspaceSettled = undefined;
  unsubscribeGeneralSettings?.();
  unsubscribeGeneralSettings = undefined;
  delete document.documentElement.dataset.skin;
  setAppMessageApi(undefined);
  chat.dispose();
  pluginRuntime.dispose().catch(() => undefined);
});
</script>

<style scoped lang="less">
.nh-layout.nh-layout--skin {
  background: transparent;
}

.nh-layout--skin :deep(.nh-composer) {
  background: transparent;
}

.nh-layout--skin :deep(.nh-composer .n-input),
.nh-layout--skin :deep(.nh-composer .n-input:hover),
.nh-layout--skin :deep(.nh-composer .n-input.n-input--focus),
.nh-layout--skin :deep(.nh-composer .n-input.n-input--stateful) {
  background-color: transparent;
}

.nh-layout__body,
.nh-layout :deep(.nh-statusbar) {
  position: relative;
  z-index: var(--nh-z-content);
}

.nh-layout :deep(.nh-titlebar) {
  position: relative;
  z-index: var(--nh-z-chrome);
}

.nh-layout {
  display: grid;
  height: 100%;
  overflow: hidden;
  grid-template-rows: 44px minmax(0, 1fr) 44px;
  background: var(--nh-color-bg-base);
  transition: --nh-rail-w var(--nh-duration-base) var(--nh-ease-standard);
}

@media (prefers-reduced-motion: reduce) {
  .nh-layout {
    transition: none;
  }
}

.nh-layout__body {
  display: grid;
  min-height: 0;
  overflow: hidden;
  grid-template-rows: minmax(0, 1fr);
  grid-template-columns: var(--nh-rail-w, 176px) var(--nh-sidebar-w, 248px) minmax(0, 1fr) auto;
}

@media (width <= 1024px) {
  .nh-layout__body {
    grid-template-columns: var(--nh-rail-w, 176px) var(--nh-sidebar-w-narrow, 232px) minmax(0, 1fr) auto;
  }
}</style>
