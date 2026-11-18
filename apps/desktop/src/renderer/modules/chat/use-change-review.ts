/**
 * 变更审阅状态：分组、diff 加载与检查点回滚。
 */

import { computed, ref, type Ref } from 'vue';
import { useMessage } from 'naive-ui';
import type { CheckpointDiffResult } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import { getCheckpointDiff, restoreCheckpoint } from './api/checkpoint.api';
import {
  buildChangeGroups,
  buildChangeSections,
  buildRunOrder,
  type ChangeGroup
} from './change-groups';
import type { ChatChange } from './types';

export const useChangeReview = (changes: Ref<ChatChange[]>, sessionId: Ref<string | undefined>) => {
  const message = useMessage();
  const selectedKey = ref<string>();
  const diff = ref<CheckpointDiffResult>();
  const diffLoading = ref(false);
  const diffError = ref<string>();
  const restoringKey = ref<string>();
  const restoringRunId = ref<string>();

  const groups = computed(() => buildChangeGroups(changes.value));
  const sections = computed(() => buildChangeSections(groups.value));
  const runOrder = computed(() => buildRunOrder(changes.value));
  const selectedGroup = computed(() =>
    groups.value.find((group) => group.key === selectedKey.value)
  );
  const changeUnitLabel = computed(() =>
    groups.value.length === 1 ? t('change.itemUnitOne') : t('change.itemUnitMany')
  );
  const latestRollbackRunId = computed(
    () =>
      groups.value
        .filter((group) => !group.restored && group.runId)
        .sort((left, right) => right.latestAt - left.latestAt)
        .at(0)?.runId
  );

  const runLabel = (runId: string | undefined): string => {
    const index = runId ? runOrder.value.get(runId) : undefined;
    return index ? `${t('change.runLabel')} ${index}` : t('change.historyLabel');
  };

  /**
   * 读取并展示文件 diff；再次点击同一文件则收起。
   */
  const selectGroup = async (group: ChangeGroup): Promise<void> => {
    if (selectedKey.value === group.key && diff.value) {
      selectedKey.value = undefined;
      diff.value = undefined;
      return;
    }
    selectedKey.value = group.key;
    diff.value = undefined;
    diffError.value = undefined;
    if (!sessionId.value || group.changes.length === 0) return;

    diffLoading.value = true;
    try {
      diff.value = await getCheckpointDiff(sessionId.value, group.changes[0]!.checkpointId);
    } catch (error) {
      diffError.value = error instanceof Error ? error.message : t('change.diffFailed');
    } finally {
      diffLoading.value = false;
    }
  };

  /**
   * 按事件顺序倒序恢复同组检查点，确保回到首次写入前。
   */
  const restoreGroup = async (group: ChangeGroup): Promise<void> => {
    if (!sessionId.value) return;
    restoringKey.value = group.key;
    try {
      const pending = group.changes.filter((change) => !change.restored).reverse();
      for (const change of pending) {
        await restoreCheckpoint(sessionId.value, change.checkpointId);
      }
      message.success(t('change.restoredDone'));
      diff.value = undefined;
      selectedKey.value = undefined;
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('change.restoreFailed'));
    } finally {
      restoringKey.value = undefined;
    }
  };

  /**
   * 回滚指定 Run 的所有未恢复变更。
   */
  const restoreRun = async (runId: string): Promise<void> => {
    if (!sessionId.value) return;
    restoringRunId.value = runId;
    try {
      const pending = changes.value
        .filter((change) => change.runId === runId && !change.restored)
        .reverse();
      for (const change of pending) {
        await restoreCheckpoint(sessionId.value, change.checkpointId);
      }
      message.success(t('change.restoredDone'));
      diff.value = undefined;
      selectedKey.value = undefined;
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('change.restoreFailed'));
    } finally {
      restoringRunId.value = undefined;
    }
  };

  return {
    selectedKey,
    diff,
    diffLoading,
    diffError,
    restoringKey,
    restoringRunId,
    groups,
    sections,
    selectedGroup,
    changeUnitLabel,
    latestRollbackRunId,
    runLabel,
    selectGroup,
    restoreGroup,
    restoreRun
  };
};
