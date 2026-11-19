/**
 * 输入区文件引用：维护已选文件、提交载荷、会话切换清理与用户提示。
 */

import { ref, watch, type Ref } from 'vue';
import { useMessage } from 'naive-ui';
import type { MessageFileReference } from '@shared/events';
import type { WorkspaceFileReference } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';

const MAX_IMAGES = 4;
const MAX_REFERENCES = 64;

interface ComposerReferenceOptions {
  draft: Ref<string>;
  sessionId: Ref<string | undefined>;
  disabled: Ref<boolean>;
  running: Ref<boolean>;
  send: (prompt: string, imagePaths?: string[], references?: MessageFileReference[]) => void;
}

export const useComposerReferences = (options: ComposerReferenceOptions) => {
  const message = useMessage();
  const selectedReferences = ref<WorkspaceFileReference[]>([]);

  /**
   * 添加文件引用；同一路径只保留一次，图片最多四张并提示。
   */
  const addReference = (reference: WorkspaceFileReference): void => {
    if (selectedReferences.value.some((file) => file.path === reference.path)) return;
    if (selectedReferences.value.length >= MAX_REFERENCES) {
      message.warning(t('chat.fileReferenceLimit'));
      return;
    }
    if (
      reference.isImage &&
      selectedReferences.value.filter((file) => file.isImage).length >= MAX_IMAGES
    ) {
      message.warning(t('chat.fileReferenceImageLimit'));
      return;
    }
    selectedReferences.value = [...selectedReferences.value, reference];
  };

  /**
   * 移除已选文件引用。
   */
  const removeReference = (path: string): void => {
    selectedReferences.value = selectedReferences.value.filter((file) => file.path !== path);
  };

  /**
   * 提交非空消息，正文与文件引用分开回传。
   */
  const send = (): void => {
    const prompt = options.draft.value.trim();
    if (
      (!prompt && !selectedReferences.value.length) ||
      options.disabled.value ||
      options.running.value
    )
      return;
    const imagePaths = selectedReferences.value
      .filter((file) => file.isImage)
      .map((file) => file.path);
    const references = selectedReferences.value.map((file) => ({
      path: file.path,
      name: file.name
    }));
    selectedReferences.value = [];
    options.draft.value = '';
    options.send(
      prompt,
      imagePaths.length ? imagePaths : undefined,
      references.length ? references : undefined
    );
  };

  watch(options.sessionId, () => {
    selectedReferences.value = [];
  });

  return { selectedReferences, addReference, removeReference, send };
};
