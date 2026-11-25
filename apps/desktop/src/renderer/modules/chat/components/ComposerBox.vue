<template>
  <form
    class="nh-composer"
    :class="{ 'nh-composer--hero': hero }"
    @submit.prevent="submit"
    @dragover.prevent
    @drop.prevent="onDrop"
  >
    <div class="nh-composer__toolbar">
      <div class="nh-composer__toolbar-left">
        <ComposerRootPicker
          :roots="roots"
          @choose-root="emit('choose-root')"
          @remove-root="emit('remove-root', $event)"
        />
      </div>
      <div class="nh-composer__toolbar-right">
        <PluginSlot
          v-if="sessionId"
          location="composer.toolbar"
          :context="{ location: 'composer.toolbar', sessionId, usage }"
        />
        <ComposerModelPicker
          :providers="providers"
          :models="models"
          :provider-id="providerId"
          :model-id="modelId"
          @update-provider="emit('update-provider', $event)"
          @update-model="emit('update-model', $event)"
          @open-settings="emit('open-settings')"
        />
      </div>
    </div>
    <PluginSlot
      v-if="sessionId"
      location="composer.above"
      :context="{ location: 'composer.above', sessionId, usage }"
    />
    <NPopover
      :show="(skillOpen && skillItems.length > 0) || referenceOpen"
      trigger="manual"
      placement="top-start"
      :show-arrow="false"
      :style="{ width: 'min(420px, calc(100vw - 48px))' }"
    >
      <template #trigger>
        <NInput
          ref="inputRef"
          v-model:value="draft"
          type="textarea"
          :bordered="false"
          :autosize="{ minRows: 2, maxRows: 6 }"
          :placeholder="placeholder"
          :disabled="disabled || running"
          @keydown="onComposerKeydown"
          @paste="onPaste"
          @blur="onInputBlur"
        >
          <template v-if="selectedSkill" #prefix>
            <SkillTag
              :id="selectedSkill.id"
              :title="selectedSkill.name"
              removable
              @remove="clearSelectedSkill"
            />
          </template>
        </NInput>
      </template>
      <SkillPalette
        v-if="skillOpen && skillItems.length > 0"
        :items="skillItems"
        :active-index="skillActiveIndex"
        @select="chooseSkill"
        @hover="skillActiveIndex = $event"
      />
      <ComposerFileReference
        v-else-if="referenceOpen"
        :references="references"
        :active-index="activeIndex"
        :searching="searching"
        @select="selectReference"
      />
    </NPopover>
    <ComposerFileChips
      :files="selectedReferences"
      :attachments="attachments"
      :session-id="sessionId"
      @remove="removeReference"
      @remove-attachment="remove"
    />
    <PluginSlot
      v-if="sessionId"
      location="composer.footer"
      :context="{ location: 'composer.footer', sessionId, usage }"
    />
    <input
      ref="fileInput"
      class="nh-composer__file-input"
      type="file"
      multiple
      :disabled="disabled || running || uploading"
      @change="onFilePick"
    />
    <ComposerActions
      :disabled="disabled"
      :disabled-reason="disabledReason"
      :running="running"
      :mode="mode"
      :approval-policy="approvalPolicy"
      :has-workspace="roots.length > 0"
      :can-send="hasSendableContent && !uploading"
      :can-reference="roots.length > 0"
      :can-attach="!disabled && !running && !uploading"
      @attach="fileInput?.click()"
      @stop="emit('stop')"
      @update-mode="emit('update-mode', $event)"
      @update-approval-policy="emit('update-approval-policy', $event)"
    />
  </form>
</template>

<script setup lang="ts">
/**
 * 输入区：消息发送、文件引用和模型/工作区选择。
 */

import { computed, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue';
import { NInput, NPopover, type InputInst } from 'naive-ui';
import type { MessageFileReference } from '@shared/events';
import { buildSkillPrompt } from '@shared/skills';
import { subscribeComposerInsert } from '@/composables/composer-bus';
import type { SkillSummary } from '@shared/skills';
import type {
  AgentMode,
  ApprovalPolicy,
  ProviderModel,
  ProviderPublic,
  SessionRoot
} from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import { filesFromClipboard } from '../clipboard-files';
import { useComposerAttachments } from '../use-composer-attachments';
import { useComposerReferences } from '../use-composer-references';
import { useFileReference } from '../use-file-reference';
import ComposerActions from './ComposerActions.vue';
import ComposerFileChips from './ComposerFileChips.vue';
import ComposerFileReference from './ComposerFileReference.vue';
import ComposerModelPicker from './ComposerModelPicker.vue';
import ComposerRootPicker from './ComposerRootPicker.vue';
import SkillTag from './SkillTag.vue';
import SkillPalette from './SkillPalette.vue';
import PluginSlot from '@/plugin-runtime/components/PluginSlot.vue';
import type { ChatUsage } from '../types';
import { useSkillPalette } from '../use-skill-palette';

const props = defineProps<{
  disabled: boolean;
  disabledReason?: string | undefined;
  running: boolean;
  roots: SessionRoot[];
  providers: ProviderPublic[];
  models: ProviderModel[];
  mode: AgentMode;
  approvalPolicy: ApprovalPolicy;
  sessionId?: string | undefined;
  ensureSession: () => Promise<string | undefined>;
  usage?: ChatUsage | undefined;
  providerId?: string | undefined;
  modelId?: string | undefined;
  hero?: boolean;
}>();

const emit = defineEmits<{
  send: [
    prompt: string,
    imagePaths?: string[],
    references?: MessageFileReference[],
    attachmentIds?: string[]
  ];
  stop: [];
  'choose-root': [];
  'remove-root': [rootId: string];
  'update-provider': [id: string];
  'open-settings': [];
  'update-model': [id: string];
  'update-mode': [mode: AgentMode];
  'update-approval-policy': [policy: ApprovalPolicy];
}>();

const draft = ref('');
const inputRef = ref<InputInst | null>(null);
const selectedSkill = ref<SkillSummary>();
const fileInput = ref<HTMLInputElement | null>(null);
const placeholder = computed(() => t('chat.composerPlaceholder'));

let unsubscribeInsert: (() => void) | undefined;
onMounted(() => {
  unsubscribeInsert = subscribeComposerInsert((text) => {
    if (!text) return;
    draft.value = draft.value ? `${draft.value} ${text}` : text;
    inputRef.value?.focus();
  });
});
onBeforeUnmount(() => {
  unsubscribeInsert?.();
  unsubscribeInsert = undefined;
});

const { attachments, uploading, hasAttachments, addFiles, remove, clear } = useComposerAttachments({
  sessionId: computed(() => props.sessionId),
  ensureSession: props.ensureSession,
  disabled: computed(() => props.disabled),
  running: computed(() => props.running)
});

const {
  open: skillOpen,
  items: skillItems,
  activeIndex: skillActiveIndex,
  choose: chooseSkill,
  refresh: refreshSkillPalette,
  handleKeydown: handleSkillKeydown
} = useSkillPalette(draft, inputRef, {
  enabled: () => !selectedSkill.value,
  onChoose: (skill) => {
    selectedSkill.value = skill;
    draft.value = '';
  }
});

/**
 * 清除临时选择的 Skill；若输入框仍以 / 开头，重新打开候选。
 */
const clearSelectedSkill = (): void => {
  selectedSkill.value = undefined;
  refreshSkillPalette();
};

const onComposerKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Backspace' && !event.isComposing && !draft.value && selectedSkill.value) {
    event.preventDefault();
    clearSelectedSkill();
    return;
  }
  if (handleSkillKeydown(event)) return;
  onKeydown(event);
};

const onInputBlur = (): void => {
  closeReferences();
  skillOpen.value = false;
};
const { selectedReferences, addReference, removeReference, send } = useComposerReferences({
  draft,
  sessionId: computed(() => props.sessionId),
  disabled: computed(() => props.disabled),
  running: computed(() => props.running),
  hasAttachments,
  send: (prompt, imagePaths, references) => {
    emit(
      'send',
      prompt,
      imagePaths,
      references,
      attachments.value.map((attachment) => attachment.id)
    );
    clear();
  }
});

const hasSendableContent = computed(() =>
  Boolean(
    draft.value.trim() ||
    selectedReferences.value.length ||
    hasAttachments.value ||
    selectedSkill.value
  )
);

/**
 * 关闭候选列表后提交消息；选了 Skill 时在发送前恢复 /id 前缀。
 */
const submit = (): void => {
  closeReferences();
  const skill = selectedSkill.value;
  if (!skill || !hasSendableContent.value || props.disabled || props.running) {
    send();
    return;
  }
  const prompt = draft.value.trim();
  selectedSkill.value = undefined;
  draft.value = buildSkillPrompt(skill.id, prompt);
  send();
};

watch(
  () => props.sessionId,
  () => {
    selectedSkill.value = undefined;
  }
);

/**
 * 处理文件选择、粘贴与拖拽上传。
 */
const onFilePick = (event: Event): void => {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = '';
  addFiles(files).catch((error: unknown) => {
    console.error('添加附件失败', error);
  });
};

const onPaste = (event: ClipboardEvent): void => {
  const files = filesFromClipboard(event.clipboardData);
  if (!files.length) return;
  event.preventDefault();
  addFiles(files).catch((error: unknown) => {
    console.error('添加附件失败', error);
  });
};

const onDrop = (event: DragEvent): void => {
  const files = [...(event.dataTransfer?.files ?? [])];
  if (files.length) {
    addFiles(files).catch((error: unknown) => {
      console.error('添加附件失败', error);
    });
  }
};

/**
 * 输入框内 Tab 切换 Plan/Build；带修饰键或运行中保留原生焦点导航。
 */
const onTab = (event: KeyboardEvent): void => {
  if (
    event.isComposing ||
    event.shiftKey ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    props.running
  ) {
    return;
  }
  event.preventDefault();
  emit('update-mode', props.mode === 'plan' ? 'build' : 'plan');
};

const {
  references,
  activeIndex,
  searching,
  open: referenceOpen,
  close: closeReferences,
  select: selectReference,
  onKeydown
} = useFileReference({
  draft,
  sessionId: toRef(props, 'sessionId'),
  disabled: computed(() => props.disabled),
  running: computed(() => props.running),
  enabled: computed(() => props.roots.length > 0),
  inputRef,
  formatReference: () => '',
  onSelect: addReference,
  submit,
  toggleMode: onTab
});
</script>

<style scoped lang="less">
@import url('../../../styles/input-prefix.less');

.nh-composer {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 6px;
  width: calc(100% - 32px);
  max-width: 1104px;
  margin: 0 auto 24px;
  padding: 10px 12px 8px;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 16px;
  background: var(--nh-surface-base);
  box-shadow: var(--nh-shadow-card);
  transition:
    border-color var(--nh-duration-fast) var(--nh-ease-standard),
    box-shadow var(--nh-duration-fast) var(--nh-ease-standard);
}

.nh-composer:focus-within {
  border-color: color-mix(in srgb, var(--nh-color-accent) 45%, var(--nh-border-subtle));
  box-shadow:
    var(--nh-shadow-card),
    0 0 0 3px color-mix(in srgb, var(--nh-color-accent) 8%, transparent);
}

.nh-composer--hero {
  padding: 14px 16px 10px;
  border-radius: 16px;
  box-shadow: var(--nh-shadow-float);
}

.nh-composer__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 0 6px;
  border-bottom: 1px solid var(--nh-border-subtle);
}

.nh-composer__toolbar-right {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.nh-composer__toolbar-left {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 2px;
}

.nh-composer :deep(.n-input__prefix) {
  // NInput 前缀默认与多行输入顶部对齐，这里补偿 textarea 首行 padding
  align-self: flex-start;
  margin-right: 6px;
  padding-top: 6px;
  line-height: 1.5;
}

.nh-composer__file-input {
  display: none;
}
</style>
