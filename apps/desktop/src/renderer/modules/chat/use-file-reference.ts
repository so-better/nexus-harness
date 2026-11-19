/**
 * @ 文件引用：检测光标前的 @query，搜索 roots 并处理键盘选择。
 */

import { computed, nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import type { InputInst } from 'naive-ui';
import type { WorkspaceFileReference } from '@shared/ipc/contracts';
import { searchWorkspaceFiles } from './api/workspace.api';

interface FileReferenceOptions {
  draft: Ref<string>;
  sessionId: Ref<string | undefined>;
  disabled: Ref<boolean>;
  running: Ref<boolean>;
  enabled: Ref<boolean>;
  inputRef: Ref<InputInst | null>;
  onSelect?: (reference: WorkspaceFileReference) => void;
  formatReference?: (reference: WorkspaceFileReference) => string;
  submit: () => void;
  toggleMode: (event: KeyboardEvent) => void;
}

export const useFileReference = (options: FileReferenceOptions) => {
  const references = ref<WorkspaceFileReference[]>([]);
  const query = ref<string>();
  const activeIndex = ref(0);
  const searching = ref(false);
  const open = computed(() => query.value !== undefined);
  let start = -1;
  let end = -1;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sequence = 0;

  const close = (): void => {
    query.value = undefined;
    references.value = [];
    searching.value = false;
    start = -1;
    end = -1;
    if (timer) clearTimeout(timer);
    timer = undefined;
  };

  const search = async (value: string): Promise<void> => {
    if (!options.sessionId.value) {
      close();
      return;
    }
    const current = ++sequence;
    searching.value = true;
    try {
      const found = await searchWorkspaceFiles(options.sessionId.value, value);
      if (current !== sequence) return;
      references.value = found;
      activeIndex.value = 0;
    } catch {
      if (current === sequence) references.value = [];
    } finally {
      if (current === sequence) searching.value = false;
    }
  };

  const update = async (): Promise<void> => {
    await nextTick();
    if (options.disabled.value || options.running.value || !options.enabled.value) {
      close();
      return;
    }
    const textarea = document.activeElement;
    const caret =
      textarea instanceof HTMLTextAreaElement
        ? textarea.selectionStart
        : options.draft.value.length;
    const before = options.draft.value.slice(0, caret);
    const at = before.lastIndexOf('@');
    if (at < 0 || (at > 0 && !/\s/.test(before[at - 1] ?? '')) || /\s/.test(before.slice(at + 1))) {
      close();
      return;
    }
    start = at;
    end = caret;
    query.value = before.slice(at + 1);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void search(query.value ?? '');
    }, 160);
  };

  const select = (reference: WorkspaceFileReference): void => {
    if (start < 0 || end < 0) return;
    const replacement = options.formatReference?.(reference) ?? `@${reference.path} `;
    options.draft.value = `${options.draft.value.slice(0, start)}${replacement}${options.draft.value.slice(end)}`;
    options.onSelect?.(reference);
    close();
    options.inputRef.value?.focus();
  };

  const onKeydown = (event: KeyboardEvent): void => {
    if (open.value) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        activeIndex.value = (activeIndex.value + 1) % Math.max(references.value.length, 1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        activeIndex.value =
          (activeIndex.value - 1 + Math.max(references.value.length, 1)) %
          Math.max(references.value.length, 1);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === 'Enter' && !event.isComposing && !event.shiftKey) {
        event.preventDefault();
        const reference = references.value[activeIndex.value];
        if (reference) {
          select(reference);
        } else {
          close();
          options.submit();
        }
        return;
      }
      if (
        event.key === 'Tab' &&
        !event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        const reference = references.value[activeIndex.value];
        if (reference) {
          select(reference);
        } else {
          close();
          options.toggleMode(event);
        }
        return;
      }
    }
    if (event.key === 'Enter' && !event.isComposing && !event.shiftKey) {
      event.preventDefault();
      options.submit();
    } else if (event.key === 'Tab') {
      options.toggleMode(event);
    }
  };

  watch(
    [
      options.draft,
      () => options.sessionId.value,
      () => options.running.value,
      () => options.enabled.value
    ],
    () => {
      void update();
    },
    { immediate: true }
  );

  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer);
  });

  return {
    references,
    activeIndex,
    searching,
    open,
    close,
    select,
    onKeydown
  };
};
