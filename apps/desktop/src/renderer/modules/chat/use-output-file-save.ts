/**
 * 输出文件另存为：统一保存状态与成功/失败提示。
 */
import { ref } from 'vue';
import { useMessage } from 'naive-ui';
import type { OutputFile } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import { saveOutputFileAs } from './api/files.api';

export const useOutputFileSave = () => {
  const message = useMessage();
  const saving = ref(false);

  const saveAs = async (file: OutputFile): Promise<void> => {
    if (saving.value) return;
    saving.value = true;
    try {
      const result = await saveOutputFileAs(file.sessionId, file.id);
      if (result.saved) message.success(t('file.saved'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('file.saveFailed'));
    } finally {
      saving.value = false;
    }
  };

  return { saving, saveAs };
};
