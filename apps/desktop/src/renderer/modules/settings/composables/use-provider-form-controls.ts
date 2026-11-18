/**
 * Provider 表单控制：新建状态、表单引用与提交校验。
 */

import { computed, nextTick, ref, watch, type Ref } from 'vue';
import type { FormInst, InputInst } from 'naive-ui';

interface Options {
  selectedId: Ref<string | null>;
  newProvider: () => void;
  saveProviderForm: () => Promise<void>;
  formRef: Ref<FormInst | null>;
  nameInputRef: Ref<InputInst | null>;
}

/**
 * 创建表单交互控制；面板只负责展示字段。
 */
export const useProviderFormControls = (options: Options) => {
  const { formRef, nameInputRef } = options;
  const creating = ref(false);
  const editing = ref(false);
  const isFormVisible = computed(() => creating.value || editing.value);

  /**
   * 进入新建状态；空列表时展开表单并聚焦名称。
   */
  const startNew = async (): Promise<void> => {
    options.newProvider();
    editing.value = false;
    creating.value = true;
    await nextTick();
    nameInputRef.value?.focus();
  };

  /**
   * 进入已有 Provider 的编辑状态。
   */
  const startEdit = (): void => {
    creating.value = false;
    editing.value = true;
  };

  /**
   * 返回 Provider 列表。
   */
  const backToList = (): void => {
    creating.value = false;
    editing.value = false;
  };

  /**
   * 提交前执行 Naive UI 表单校验。
   */
  const handleSave = async (): Promise<void> => {
    if (!formRef.value) return;
    try {
      await formRef.value.validate();
      await options.saveProviderForm();
    } catch {
      // 表单错误由 NFormItem 直接展示
    }
  };

  watch(options.selectedId, () => {
    formRef.value?.restoreValidation();
  });

  return { creating, editing, isFormVisible, startNew, startEdit, backToList, handleSave };
};
