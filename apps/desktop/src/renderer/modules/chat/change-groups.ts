/**
 * 变更审阅分组：按 Run + 文件聚合检查点，并生成 Run 分区。
 */

import type { ChatChange } from './types';

export type ChangeKind = 'created' | 'modified' | 'deleted';

export interface ChangeGroup {
  key: string;
  path: string;
  runId?: string;
  label: string;
  kind: ChangeKind;
  latestAt: number;
  restored: boolean;
  changes: ChatChange[];
}

export interface ChangeSection {
  key: string;
  runId?: string;
  latestAt: number;
  groups: ChangeGroup[];
}

/**
 * 推断面向用户的变更类型；write_file 依据检查点是否已存在区分新增/修改。
 */
export const kindOf = (changes: ChatChange[]): ChangeKind => {
  if (changes.some((change) => change.label === 'delete_file')) return 'deleted';
  const first = changes[0];
  if (first?.label === 'write_file' && first.existed === false) return 'created';
  return 'modified';
};

/**
 * 按 Run + 文件分组，避免同一文件多次写入产生重复行。
 */
export const buildChangeGroups = (changes: ChatChange[]): ChangeGroup[] => {
  const map = new Map<string, ChangeGroup>();
  for (const change of changes) {
    const key = `${change.runId ?? 'history'}:${change.path}`;
    const group = map.get(key);
    if (group) {
      group.changes.push(change);
      group.latestAt = Math.max(group.latestAt, change.createdAt);
      group.restored = group.changes.every((item) => item.restored);
    } else {
      map.set(key, {
        key,
        path: change.path,
        ...(change.runId ? { runId: change.runId } : {}),
        label: change.label,
        kind: kindOf([change]),
        latestAt: change.createdAt,
        restored: change.restored,
        changes: [change]
      });
    }
  }
  for (const group of map.values()) group.kind = kindOf(group.changes);
  return [...map.values()].sort((left, right) => right.latestAt - left.latestAt);
};

/**
 * 按 Run 生成全宽分区，保持最新 Run 在前。
 */
export const buildChangeSections = (groups: ChangeGroup[]): ChangeSection[] => {
  const map = new Map<string, ChangeSection>();
  for (const group of groups) {
    const key = group.runId ?? 'history';
    const section = map.get(key);
    if (section) {
      section.groups.push(group);
      section.latestAt = Math.max(section.latestAt, group.latestAt);
    } else {
      map.set(key, {
        key,
        ...(group.runId ? { runId: group.runId } : {}),
        latestAt: group.latestAt,
        groups: [group]
      });
    }
  }
  return [...map.values()].sort((left, right) => right.latestAt - left.latestAt);
};

/**
 * 根据事件时间建立 Run 序号。
 */
export const buildRunOrder = (changes: ChatChange[]): Map<string, number> => {
  const starts = new Map<string, number>();
  for (const change of changes) {
    if (!change.runId) continue;
    starts.set(change.runId, Math.min(starts.get(change.runId) ?? Infinity, change.createdAt));
  }
  return new Map(
    [...starts.entries()]
      .sort((left, right) => left[1] - right[1])
      .map(([id], index) => [id, index + 1])
  );
};
