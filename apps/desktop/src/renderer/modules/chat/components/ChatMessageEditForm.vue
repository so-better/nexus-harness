<template>
  <div @dragover.prevent @drop.prevent="onEditDrop">
    <div
      v-if="editingReferences.length || editingAttachments.length"
      class="nh-message__edit-files"
    >
      <UserFileChip
        v-for="file in editingReferences"
        :key="file.path"
        :file="file"
        :session-id="sessionId"
        :is-image="isImageFile(file.name)"
        removable
        @remove="removeEditingReference(file.path)"
      />
      <AttachmentChip
        v-for="attachment in editingAttachments"
        :key="attachment.id"
        :attachment="attachment"
        removable
        @remove="removeEditingAttachment(attachment)"
      />
    </div>
    <NPopover
      :show="(editSkillOpen && editSkillItems.length > 0) || editFileOpen"
      trigger="manual"
      placement="top-start"
      :show-arrow="false"
      :style="{ width: 'min(420px, calc(100vw - 48px))' }"
    >
      <template #trigger>
        <NInput
          ref="editInput"
          v-model:value="draft"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 6 }"
          @keydown="onEditKeydown"
          @paste="onEditPaste"
          @blur="onEditBlur"
        />
      </template>
      <SkillPalette
        v-if="editSkillOpen && editSkillItems.length > 0"
        :items="editSkillItems"
        :active-index="editSkillActiveIndex"
        @select="chooseEditSkill"
        @hover="editSkillActiveIndex = $event"
      />
      <ComposerFileReference
        v-else-if="editFileOpen"
        :references="editFileCandidates"
        :active-index="editFileActiveIndex"
        :searching="editFileSearching"
        @select="selectEditFile"
      />
    </NPopover>
    <div class="nh-message__edit-actions">
      <NButton size="small" secondary @click="cancel">{{ t('chat.askUserCancel') }}</NButton>
      <NButton
        size="small"
        type="primary"
        secondary
        :disabled="
          (!draft.trim() && !editingReferences.length && !editingAttachments.length) ||
          editingUploading
        "
        @click="save"
      >
        {{ t('app.send') }}
      </NButton>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 用户消息编辑表单：引用、附件、Skill 与 @ 文件候选。
 */

import { computed, nextTick, onMounted, ref } from 'vue';
import { NButton, NInput, NPopover, type InputInst } from 'naive-ui';
import { t } from '@/app/i18n';
import type { MessageAttachment, MessageFileReference } from '@shared/events';
import type { WorkspaceFileReference } from '@shared/ipc/contracts';
import { isImageFile } from '@shared/files';
import type { ChatMessageView } from '../types';
import { splitUserMessageReferences } from '../message-references';
import { filesFromClipboard } from '../clipboard-files';
import { useComposerAttachments } from '../use-composer-attachments';
import { useFileReference } from '../use-file-reference';
import { useSkillPalette } from '../use-skill-palette';
import AttachmentChip from './AttachmentChip.vue';
import UserFileChip from './UserFileChip.vue';
import ComposerFileReference from './ComposerFileReference.vue';
import SkillPalette from './SkillPalette.vue';

const props = defineProps<{
  message: ChatMessageView;
  sessionId?: string | undefined;
  actionsDisabled?: boolean;
}>();

const emit = defineEmits<{
  save: [content: string, references?: MessageFileReference[], attachmentIds?: string[]];
  cancel: [];
}>();

const draft = ref('');
const editingReferences = ref<MessageFileReference[]>([]);
const editInput = ref<InputInst | null>(null);

/**
 * 编辑态新增文件引用，与输入区的 @ 选择保持一致。
 */
const addEditingReference = (reference: WorkspaceFileReference): void => {
  if (editingReferences.value.some((file) => file.path === reference.path)) return;
  editingReferences.value = [
    ...editingReferences.value,
    { path: reference.path, name: reference.name }
  ];
};

const editFileReference = useFileReference({
  draft,
  sessionId: computed(() => props.sessionId),
  disabled: computed(() => Boolean(props.actionsDisabled)),
  running: computed(() => Boolean(props.actionsDisabled)),
  enabled: computed(() => Boolean(props.sessionId)),
  inputRef: editInput,
  onSelect: addEditingReference,
  formatReference: () => '',
  submit: () => undefined,
  toggleMode: () => undefined
});
const editSkillPalette = useSkillPalette(draft, editInput);
const {
  attachments: editingAttachments,
  uploading: editingUploading,
  addFiles: addEditingFiles,
  remove: deleteEditingAttachment,
  detach: detachEditingAttachment,
  setAttachments: setEditingAttachmentList
} = useComposerAttachments({
  sessionId: computed(() => props.sessionId),
  ensureSession: async () => props.sessionId,
  disabled: computed(() => Boolean(props.actionsDisabled)),
  running: computed(() => Boolean(props.actionsDisabled))
});

// 编辑态已存在的附件只能从本次编辑中移除，不能立即删文件；取消编辑后原消息仍需可回放
const existingAttachmentIds = ref<string[]>([]);

const removeEditingAttachment = (attachment: MessageAttachment): void => {
  if (existingAttachmentIds.value.includes(attachment.id)) {
    detachEditingAttachment(attachment.id);
    return;
  }
  deleteEditingAttachment(attachment).catch((error: unknown) => {
    console.error('移除编辑附件失败', error);
  });
};

const removeEditingReference = (path: string): void => {
  editingReferences.value = editingReferences.value.filter((file) => file.path !== path);
};

const {
  references: editFileCandidates,
  activeIndex: editFileActiveIndex,
  searching: editFileSearching,
  open: editFileOpen,
  close: closeEditReferences,
  select: selectEditFile,
  onKeydown: onEditFileKeydown
} = editFileReference;
const {
  open: editSkillOpen,
  items: editSkillItems,
  activeIndex: editSkillActiveIndex,
  choose: chooseEditSkill,
  handleKeydown: handleEditSkillKeydown
} = editSkillPalette;

/**
 * 编辑态失焦时关闭 Skill 与 @ 候选，避免浮层残留。
 */
const onEditBlur = (): void => {
  closeEditReferences();
  editSkillOpen.value = false;
};

/**
 * 编辑态粘贴、选择或拖入附件，与主输入区共用同一上传逻辑。
 */
const onEditPaste = (event: ClipboardEvent): void => {
  const files = filesFromClipboard(event.clipboardData);
  if (!files.length) return;
  event.preventDefault();
  addEditingFiles(files).catch((error: unknown) => {
    console.error('添加编辑附件失败', error);
  });
};

const onEditDrop = (event: DragEvent): void => {
  const files = [...(event.dataTransfer?.files ?? [])];
  if (!files.length) return;
  event.preventDefault();
  addEditingFiles(files).catch((error: unknown) => {
    console.error('添加编辑附件失败', error);
  });
};

/**
 * 编辑态键盘：优先处理 Skill 与 @ 候选，保留 Cmd/Ctrl+Enter 保存与 Esc 取消。
 */
const onEditKeydown = (event: KeyboardEvent): void => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    save();
    return;
  }
  if (editSkillOpen.value && handleEditSkillKeydown(event)) return;
  if (editFileOpen.value) {
    onEditFileKeydown(event);
    if (event.defaultPrevented) return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    cancel();
  }
};

const save = (): void => {
  const content = draft.value.trim();
  if (editingUploading.value) return;
  if (!content && !editingReferences.value.length && !editingAttachments.value.length) return;
  emit(
    'save',
    content,
    editingReferences.value.length ? editingReferences.value : undefined,
    editingAttachments.value.length
      ? editingAttachments.value.map((attachment) => attachment.id)
      : undefined
  );
};

const cancel = (): void => {
  emit('cancel');
};

const start = (): void => {
  const parts = splitUserMessageReferences(props.message.content);
  draft.value = props.message.references?.length ? props.message.content : parts.text;
  editingReferences.value = props.message.references?.length
    ? props.message.references
    : parts.references;
  const initialAttachments = props.message.attachments ?? [];
  existingAttachmentIds.value = initialAttachments.map((attachment) => attachment.id);
  setEditingAttachmentList(initialAttachments);
  nextTick(() => {
    editInput.value?.focus();
    const textarea = editInput.value?.textareaElRef;
    if (!textarea) return;
    const end = textarea.value.length;
    textarea.selectionStart = end;
    textarea.selectionEnd = end;
  });
};

onMounted(start);
</script>

<style scoped lang="less">
.nh-message__edit-files {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.nh-message__edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
</style>
