<template>
  <NCollapse v-model:expanded-names="expandedNames" class="nh-tool">
    <NCollapseItem :name="tool.id">
      <template #header>
        <div class="nh-tool__summary">
          <span class="nh-tool__identity">
            <span class="nh-tool__icon">
              <AppIcon :name="toolIcon" :size="14" />
            </span>
            <span class="nh-tool__name" :title="tool.name">{{ tool.name }}</span>
          </span>
          <span class="nh-tool__tail">
            <span class="nh-tool__status" :class="'nh-tool__status--' + statusTone">
              <span class="nh-tool__dot" />
              {{ statusLabel }}
            </span>
            <AppIcon
              :name="expandedNames.includes(tool.id) ? 'chevron-up' : 'chevron-down'"
              :size="14"
            />
          </span>
        </div>
      </template>
      <div class="nh-tool__body">
        <section v-if="!tool.subagent" class="nh-tool__block">
          <div class="nh-tool__block-head">
            <span class="nh-tool__label">{{ t('tool.input') }}</span>
            <NButton text size="tiny" @click="copyText('input', inputText)">
              <template #icon><AppIcon name="copy" :size="12" /></template>
              {{ copied === 'input' ? t('chat.copied') : t('chat.copy') }}
            </NButton>
          </div>
          <pre class="nh-tool__pre">{{ inputText }}</pre>
        </section>
        <section v-if="tool.output && !tool.subagent" class="nh-tool__block">
          <div class="nh-tool__block-head">
            <span class="nh-tool__label">{{ t('tool.output') }}</span>
            <NButton text size="tiny" @click="copyText('output', tool.output)">
              <template #icon><AppIcon name="copy" :size="12" /></template>
              {{ copied === 'output' ? t('chat.copied') : t('chat.copy') }}
            </NButton>
          </div>
          <pre class="nh-tool__pre">{{ tool.output }}</pre>
        </section>
        <section v-if="tool.subagent" class="nh-tool__block nh-tool__subagent">
          <div class="nh-tool__block-head">
            <span class="nh-tool__label">
              {{ t('tool.subagent') }} · {{ tool.subagent.agent }}
            </span>
          </div>
          <div class="nh-tool__sub-body">
            <p v-if="tool.subagent.description" class="nh-tool__sub-desc">
              {{ tool.subagent.description }}
            </p>
            <p v-if="tool.subagent.summary" class="nh-tool__sub-summary">
              {{ tool.subagent.summary }}
            </p>
            <div v-if="hasSubagentProcess" class="nh-tool__sub-process-head">
              <NButton
                text
                size="tiny"
                class="nh-tool__sub-process-toggle"
                :disabled="processToggleDisabled"
                @click="toggleProcess"
              >
                <template #icon>
                  <AppIcon :name="processOpen ? 'chevron-up' : 'chevron-down'" :size="12" />
                </template>
                {{ processOpen ? t('tool.subagentHideProcess') : t('tool.subagentShowProcess') }}
              </NButton>
              <span v-if="runs.length > 1 && !processOpen" class="nh-tool__sub-run-count">
                {{ t('tool.subagentRuns', { count: runs.length }) }}
              </span>
            </div>
            <div v-show="processOpen" class="nh-tool__sub-process">
              <div v-if="runs.length > 1" class="nh-tool__sub-tabs" role="tablist">
                <button
                  v-for="(run, index) in runs"
                  :key="run.runId"
                  type="button"
                  role="tab"
                  class="nh-tool__sub-tab"
                  :class="{ 'nh-tool__sub-tab--active': index === currentRunIndex }"
                  :aria-selected="index === currentRunIndex"
                  @click="selectRun(index)"
                >
                  <span class="nh-tool__sub-tab-label">#{{ index + 1 }}</span>
                  <span
                    class="nh-tool__sub-tab-dot"
                    :class="`nh-tool__sub-tab-dot--${runStatusTone(run)}`"
                  />
                  <span class="nh-tool__sub-tab-status">{{ runStatusLabel(run) }}</span>
                </button>
              </div>
              <ul v-if="tool.subagent.progress.length && !runs.length" class="nh-tool__sub-steps">
                <li v-for="step in tool.subagent.progress" :key="step.id">
                  <span class="nh-tool__sub-mark">{{
                    step.ok === undefined ? '…' : step.ok ? '✓' : '✕'
                  }}</span>
                  <code>{{ step.name }}</code>
                </li>
              </ul>
              <WorkspaceAuthCard
                v-if="workspaceAuth && !runs.length"
                :request="workspaceAuth"
                :data-workspace-auth-id="workspaceAuth.requestId"
                @allow="emit('allow-workspace')"
                @reject="emit('reject-workspace')"
              />
              <SubagentTimeline
                v-if="activeRun"
                :projection="activeRun.projection"
                :session-id="sessionId"
                :workspace-auth="workspaceAuth"
                @approve="(approvalId) => emit('approve', approvalId)"
                @reject="(approvalId) => emit('reject', approvalId)"
                @allow-workspace="emit('allow-workspace')"
                @reject-workspace="emit('reject-workspace')"
              />
            </div>
            <p v-if="tool.subagent.usage" class="nh-tool__sub-usage">
              {{ t('tool.subagentUsage') }}: {{ tool.subagent.usage.inputTokens }} /
              {{ tool.subagent.usage.outputTokens }}
            </p>
            <div v-if="transcriptRefs.length" class="nh-tool__sub-transcripts">
              <NButton
                v-for="item in transcriptRefs"
                :key="item.ref"
                text
                size="tiny"
                class="nh-tool__sub-toggle"
                @click="openTranscript(item.ref)"
              >
                {{
                  transcriptRefs.length > 1
                    ? `${t('tool.subagentTranscript')} #${item.index + 1}`
                    : t('tool.subagentTranscript')
                }}
              </NButton>
            </div>
          </div>
          <SubagentTranscriptModal
            v-model:show="transcriptShow"
            :session-id="sessionId"
            :artifact-id="transcriptArtifactId"
          />
        </section>
        <div v-if="tool.error" class="nh-tool__error">
          <span class="nh-tool__error-text"> {{ tool.error.code }}: {{ tool.error.message }} </span>
          <NButton
            v-if="needsAuthorization"
            class="nh-tool__authorize"
            text
            type="error"
            size="tiny"
            strong
            @click="emit('authorize-root')"
          >
            {{ t('tool.authorizeRootAction') }} →
          </NButton>
        </div>
        <ToolArtifactCard
          v-if="tool.artifactId"
          :session-id="sessionId"
          :artifact-id="tool.artifactId"
        />
        <PluginSlot
          location="toolcall.body"
          :context="{
            location: 'toolcall.body',
            sessionId,
            messageId,
            runId,
            toolCallId: tool.id
          }"
        />
      </div>
      <PluginSlot
        location="toolcall.footer"
        :context="{
          location: 'toolcall.footer',
          sessionId,
          messageId,
          runId,
          toolCallId: tool.id
        }"
      />
    </NCollapseItem>
  </NCollapse>
</template>

<script setup lang="ts">
/**
 * 工具调用卡片：折叠展示参数、输出、错误与产物引用。
 */

import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { NButton, NCollapse, NCollapseItem } from 'naive-ui';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import type { WorkspaceAuthorizationRequest } from '@shared/ipc/contracts';
import type { ChatProjection, ChatToolCall } from '../types';
import SubagentTimeline from './SubagentTimeline.vue';
import SubagentTranscriptModal from './SubagentTranscriptModal.vue';
import ToolArtifactCard from './ToolArtifactCard.vue';
import WorkspaceAuthCard from './WorkspaceAuthCard.vue';
import PluginSlot from '@/plugin-runtime/components/PluginSlot.vue';

const props = withDefaults(
  defineProps<{
    tool: ChatToolCall;
    /** 初始展开状态；用于预览/调试，也可用于后续自动展开失败工具。 */
    defaultExpanded?: boolean;
    sessionId?: string | undefined;
    messageId?: string | undefined;
    runId?: string | undefined;
    workspaceAuth?: WorkspaceAuthorizationRequest | null;
  }>(),
  {
    defaultExpanded: false,
    sessionId: undefined,
    messageId: undefined,
    runId: undefined,
    workspaceAuth: null
  }
);

const emit = defineEmits<{
  'authorize-root': [];
  approve: [approvalId: string];
  reject: [approvalId: string];
  'allow-workspace': [];
  'reject-workspace': [];
}>();

const expandedNames = ref<Array<string | number>>(props.defaultExpanded ? [props.tool.id] : []);

// 子代理审批/目录授权需要用户在嵌套时间线内直接操作，出现阻塞时自动展开
watch(
  [() => props.tool.subagent?.pendingApprovals ?? 0, () => Boolean(props.workspaceAuth)],
  ([count, hasWorkspaceAuth]) => {
    if ((count > 0 || hasWorkspaceAuth) && !expandedNames.value.includes(props.tool.id)) {
      expandedNames.value = [...expandedNames.value, props.tool.id];
    }
  },
  { immediate: true }
);

type SubagentRun = { runId: string; projection: ChatProjection };

const runs = computed<SubagentRun[]>(() => props.tool.subagent?.runs ?? []);
const processOpen = ref(props.tool.subagent?.status !== 'succeeded');
const activeRunIndex = ref(0);
const currentRunIndex = computed(() =>
  runs.value.length ? Math.min(activeRunIndex.value, runs.value.length - 1) : 0
);
const activeRun = computed(() => runs.value[currentRunIndex.value]);
const processToggleDisabled = computed(
  () => Boolean(props.tool.subagent?.pendingApprovals) || Boolean(props.workspaceAuth)
);
const displayStatus = computed<ChatToolCall['status']>(() => {
  const subagent = props.tool.subagent;
  if (!subagent) return props.tool.status;
  if (subagent.pendingApprovals) return 'waiting_approval';
  if (subagent.status === 'running') return 'running';
  if (subagent.status === 'succeeded') return 'succeeded';
  if (subagent.status === 'failed') return 'failed';
  return props.tool.status;
});
const hasSubagentProcess = computed(
  () =>
    runs.value.length > 0 ||
    Boolean(props.tool.subagent?.progress.length) ||
    Boolean(props.workspaceAuth && !runs.value.length)
);

const runPendingCount = (run: SubagentRun): number =>
  run.projection.approvals.filter((approval) => approval.status === 'pending').length;
const pendingRunIndex = computed(() => runs.value.findIndex((run) => runPendingCount(run) > 0));

const runStatusTone = (run: SubagentRun): 'warning' | 'success' | 'danger' | 'info' => {
  if (runPendingCount(run) > 0) return 'warning';
  if (run.projection.status === 'completed') return 'success';
  if (run.projection.status === 'failed') return 'danger';
  return 'info';
};

const runStatusLabel = (run: SubagentRun): string => {
  const pending = runPendingCount(run);
  if (pending > 0) return t('tool.subagentRunPending', { count: pending });
  if (run.projection.status === 'completed') return t('tool.subagentRunDone');
  if (run.projection.status === 'failed') return t('tool.subagentRunFailed');
  return t('tool.subagentRunRunning');
};

const selectRun = (index: number): void => {
  activeRunIndex.value = index;
};

const toggleProcess = (): void => {
  processOpen.value = !processOpen.value;
};

// 有新的阻塞项时自动切到对应 run 并展开过程
watch(
  [
    () => props.tool.subagent?.status,
    () => runs.value.length,
    () => pendingRunIndex.value,
    () => props.tool.subagent?.pendingApprovals ?? 0
  ],
  () => {
    if (pendingRunIndex.value >= 0) activeRunIndex.value = pendingRunIndex.value;
    else if (activeRunIndex.value >= runs.value.length) {
      activeRunIndex.value = Math.max(0, runs.value.length - 1);
    }
    if (pendingRunIndex.value >= 0 || props.tool.subagent?.status === 'running') {
      processOpen.value = true;
    }
  },
  { immediate: true }
);

/**
 * 子代理过程：按需打开弹窗，用真实聊天组件渲染完整对话。
 */
const transcriptShow = ref(false);
const transcriptArtifactId = ref<string>();

const transcriptRefs = computed<Array<{ index: number; ref: string }>>(() => {
  const subagent = props.tool.subagent;
  if (subagent?.transcripts?.length) return subagent.transcripts;
  if (subagent?.transcriptRef) return [{ index: 0, ref: subagent.transcriptRef }];
  return [];
});

const openTranscript = (artifactId: string): void => {
  transcriptArtifactId.value = artifactId;
  transcriptShow.value = true;
};

const copied = ref<'input' | 'output'>();
let copyTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * 复制参数或输出；剪贴板不可用时静默，不影响浏览。
 */
onBeforeUnmount(() => {
  if (copyTimer) clearTimeout(copyTimer);
});

const copyText = async (kind: 'input' | 'output', text: string): Promise<void> => {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copied.value = kind;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      if (copied.value === kind) copied.value = undefined;
    }, 1200);
  } catch {
    // 剪贴板权限不可用时保持静默
  }
};

const toolIcon = computed<
  'file' | 'edit' | 'terminal' | 'globe' | 'image' | 'spark' | 'settings' | 'history'
>(() => {
  if (props.tool.subagent) return 'spark';
  if (
    [
      'read_file',
      'list_dir',
      'glob',
      'grep',
      'save_file',
      'save_word',
      'save_excel',
      'save_ppt',
      'save_pdf'
    ].includes(props.tool.name)
  )
    return 'file';
  if (['write_file', 'apply_patch'].includes(props.tool.name)) return 'edit';
  if (props.tool.name === 'run_command') return 'terminal';
  if (props.tool.name === 'generate_image') return 'image';
  if (props.tool.name.startsWith('search_skill') || props.tool.name === 'read_skill')
    return 'spark';
  if (props.tool.name === 'fetch' || props.tool.name.startsWith('search_')) return 'globe';
  if (props.tool.name === 'checkpoint') return 'history';
  return 'settings';
});

const inputText = computed(() => {
  try {
    return JSON.stringify(props.tool.input, null, 2);
  } catch {
    return String(props.tool.input);
  }
});

const statusLabel = computed(() => {
  if (props.tool.subagent?.pendingApprovals) {
    return `${t('tool.waiting_approval')} · ${props.tool.subagent.pendingApprovals}`;
  }
  switch (displayStatus.value) {
    case 'waiting_approval':
      return t('tool.waiting_approval');
    case 'approved':
      return t('tool.approved');
    case 'rejected':
      return t('tool.rejected');
    case 'expired':
      return t('tool.expired');
    case 'running':
      return t('tool.running');
    case 'succeeded':
      return t('tool.succeeded');
    case 'failed':
      return t('tool.failed');
    default:
      return t('tool.requested');
  }
});

const needsAuthorization = computed(
  () =>
    props.tool.error?.code === 'PATH_OUTSIDE_ROOT' ||
    props.tool.error?.code === 'TOOL_WORKSPACE_REQUIRED'
);

const statusTone = computed<'success' | 'error' | 'warning' | 'info'>(() => {
  switch (displayStatus.value) {
    case 'succeeded':
      return 'success';
    case 'failed':
    case 'rejected':
      return 'error';
    case 'waiting_approval':
    case 'requested':
    case 'expired':
      return 'warning';
    default:
      return 'info';
  }
});
</script>

<style scoped lang="less">
.nh-tool {
  padding: 0;
  border: 0;
  background: transparent;
}

.nh-tool :deep(.n-collapse-item) {
  margin: 0;
  border: 0;
}

// 覆盖 Naive Collapse 默认间距，工具行使用紧凑布局
.nh-tool :deep(.n-collapse-item__header) {
  min-height: 0;
  margin: 0 -8px;
  padding: 4px 8px !important;
  border: 0;
  border-radius: 8px;
  transition: background var(--nh-duration-fast) var(--nh-ease-standard);
}

.nh-tool :deep(.n-collapse-item__header:hover) {
  background: var(--nh-surface-hover);
}

.nh-tool :deep(.n-collapse-item__header-main) {
  width: 100%;
}

// 覆盖 Naive Collapse 默认内容间距，避免展开内容离头部过远
.nh-tool :deep(.n-collapse-item__content-inner) {
  padding: 0 !important;
}

// 使用自定义 chevron，隐藏 Naive 默认箭头
.nh-tool :deep(.n-collapse-item-arrow) {
  display: none !important;
}

.nh-tool__summary {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
}

.nh-tool__identity {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.nh-tool__icon {
  display: grid;
  width: 22px;
  height: 22px;
  flex: none;
  place-items: center;
  border-radius: 6px;
  background: var(--nh-surface-elevated);
  color: var(--nh-color-text-secondary);
}

.nh-tool__name {
  overflow: hidden;
  color: var(--nh-color-text-primary);
  font-family: var(--nh-font-mono);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-tool__tail {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 2px;
}

.nh-tool__status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--nh-color-text-secondary);
  font-size: 11px;
  white-space: nowrap;
}

.nh-tool__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.nh-tool__status--success .nh-tool__dot {
  background: var(--nh-color-success);
}

.nh-tool__status--error .nh-tool__dot {
  background: var(--nh-color-danger);
}

.nh-tool__status--warning .nh-tool__dot {
  background: var(--nh-color-warning);
}

.nh-tool__status--info .nh-tool__dot {
  background: var(--nh-color-accent);
}

.nh-tool__body {
  padding: 2px 0 12px 30px;
}

.nh-tool__block {
  overflow: hidden;
  margin-top: 6px;
  border: 1px solid color-mix(in srgb, var(--nh-border-subtle) 65%, transparent);
  border-radius: 9px;
  background: var(--nh-surface-elevated);
}

.nh-tool__block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--nh-border-subtle) 65%, transparent);
}

.nh-tool__label {
  color: var(--nh-color-text-secondary);
  font-size: 11px;
}

.nh-tool__pre {
  max-height: 240px;
  overflow: auto;
  margin: 0;
  padding: 10px 12px;
  font-family: var(--nh-font-mono);
  font-size: 11px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.nh-tool__subagent .nh-tool__block-head {
  padding: 6px 12px;
}

.nh-tool__sub-body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px 12px;
}

.nh-tool__sub-steps {
  display: flex;
  margin: 0;
  padding: 0;
  flex-direction: column;
  gap: 2px;
  list-style: none;
}

.nh-tool__sub-steps li {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-tool__sub-mark {
  width: 12px;
  flex: none;
  text-align: center;
  font-family: var(--nh-font-mono);
}

.nh-tool__sub-desc {
  margin: 0;
  color: var(--nh-color-text-secondary);
  font-size: 11px;
  line-height: 1.5;
}

.nh-tool__sub-summary {
  margin: 0;
  color: var(--nh-color-text-primary);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.nh-tool__sub-usage {
  margin: 0;
  color: var(--nh-color-text-secondary);
  font-family: var(--nh-font-mono);
  font-size: 11px;
}

.nh-tool__sub-process-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.nh-tool__sub-process-toggle {
  color: var(--nh-color-text-secondary);
  font-size: 11px;
}

.nh-tool__sub-run-count {
  color: var(--nh-color-text-disabled);
  font-size: 11px;
}

.nh-tool__sub-process {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
}

.nh-tool__sub-tabs {
  display: flex;
  min-width: 0;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
}

.nh-tool__sub-tabs::-webkit-scrollbar {
  display: none;
}

.nh-tool__sub-tab {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid color-mix(in srgb, var(--nh-border-subtle) 80%, transparent);
  border-radius: 999px;
  background: var(--nh-color-bg-elevated);
  color: var(--nh-color-text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  transition:
    background var(--nh-duration-fast) var(--nh-ease-standard),
    border-color var(--nh-duration-fast) var(--nh-ease-standard),
    color var(--nh-duration-fast) var(--nh-ease-standard);
}

.nh-tool__sub-tab:hover {
  background: var(--nh-color-bg-hover);
}

.nh-tool__sub-tab:focus-visible {
  outline: 2px solid var(--nh-color-accent);
  outline-offset: 1px;
}

.nh-tool__sub-tab--active {
  border-color: color-mix(in srgb, var(--nh-color-accent) 35%, var(--nh-border-subtle));
  background: color-mix(in srgb, var(--nh-color-accent) 8%, var(--nh-color-bg-base));
  color: var(--nh-color-text-primary);
}

.nh-tool__sub-tab-label {
  font-family: var(--nh-font-mono);
  font-size: 10px;
}

.nh-tool__sub-tab-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--nh-color-idle);
}

.nh-tool__sub-tab-dot--warning {
  background: var(--nh-color-warning);
}

.nh-tool__sub-tab-dot--success {
  background: var(--nh-color-success);
}

.nh-tool__sub-tab-dot--danger {
  background: var(--nh-color-danger);
}

.nh-tool__sub-tab-status {
  white-space: nowrap;
}

.nh-tool__sub-transcripts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.nh-tool__sub-toggle {
  align-self: flex-start;
}

.nh-tool__error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 8px 0 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--nh-color-danger) 7%, transparent);
  color: var(--nh-color-danger);
  font-size: 11px;
  line-height: 1.5;
}

.nh-tool__error-text {
  min-width: 0;
  white-space: pre-wrap;
}

.nh-tool__authorize {
  flex: none;
}

.nh-tool__meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0 0;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--nh-surface-elevated);
  color: var(--nh-color-text-secondary);
  font-size: 11px;
  overflow-wrap: anywhere;
}
</style>
