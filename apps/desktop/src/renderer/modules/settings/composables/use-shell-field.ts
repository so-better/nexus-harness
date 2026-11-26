/**
 * Shell 设置字段的通用逻辑：路径输入、自动检测、文件选择与脏标记。
 * 交互式 shell 与 AI 命令 shell 共用同一套状态机，避免重复实现。
 */

import { ref, type Ref } from 'vue';
import type { TerminalShellInfo } from '@shared/ipc/contracts';

export interface ShellFieldOptions {
  /** 打开文件选择对话框；返回空表示取消 */
  choosePath: () => Promise<string | undefined>;
  /** 触发保存（字段本身不持有持久化逻辑） */
  requestSave: () => void;
  /** 选择失败时的提示回调 */
  onChooseError: () => void;
}

export interface ShellField {
  /** 输入框展示值 */
  path: Ref<string>;
  /** 是否处于自动检测（未自定义） */
  usingAuto: Ref<boolean>;
  /** 宿主解析出的 shell 信息 */
  info: Ref<TerminalShellInfo | undefined>;
  /** 是否有未保存修改 */
  isDirty: () => boolean;
  /** 当前编辑版本号，用于判定保存回填是否过期 */
  revision: () => number;
  /** 输入框编辑 */
  updatePath: (value: string) => void;
  /** 切回自动检测并保存 */
  useAuto: () => void;
  /** 选择文件并保存 */
  choose: () => Promise<void>;
  /** 计算要保存的 shell 值（自动或空输入时为 null） */
  current: () => string | null;
  /** 载入设置回填 */
  load: (configured: string | null, info: TerminalShellInfo) => void;
  /** 保存成功后回填；版本号一致时清除脏标记 */
  applySaved: (configured: string | null, info: TerminalShellInfo, snapshotRevision: number) => void;
}

export const useShellField = (options: ShellFieldOptions): ShellField => {
  const path = ref('');
  const usingAuto = ref(true);
  const info = ref<TerminalShellInfo>();
  let dirty = false;
  let version = 0;

  const markDirty = (): void => {
    dirty = true;
    version += 1;
  };

  const updatePath = (value: string): void => {
    path.value = value;
    usingAuto.value = false;
    markDirty();
  };

  const useAuto = (): void => {
    usingAuto.value = true;
    path.value = info.value?.path ?? '';
    markDirty();
    options.requestSave();
  };

  const choose = async (): Promise<void> => {
    try {
      const chosen = await options.choosePath();
      if (!chosen) return;
      usingAuto.value = false;
      path.value = chosen;
      markDirty();
      options.requestSave();
    } catch {
      options.onChooseError();
    }
  };

  const current = (): string | null =>
    usingAuto.value || !path.value.trim() ? null : path.value.trim();

  const load = (configured: string | null, nextInfo: TerminalShellInfo): void => {
    info.value = nextInfo;
    usingAuto.value = !configured;
    path.value = configured ?? nextInfo.path;
  };

  const applySaved = (
    configured: string | null,
    nextInfo: TerminalShellInfo,
    snapshotRevision: number
  ): void => {
    usingAuto.value = !configured;
    info.value = nextInfo;
    path.value = configured ?? nextInfo.path;
    if (snapshotRevision === version) dirty = false;
  };

  return {
    path,
    usingAuto,
    info,
    isDirty: () => dirty,
    revision: () => version,
    updatePath,
    useAuto,
    choose,
    current,
    load,
    applySaved
  };
};
