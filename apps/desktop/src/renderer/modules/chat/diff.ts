/**
 * 轻量行级 diff：小文件使用 LCS，大文件降级为前后缀加中间替换。
 */

export interface DiffLine {
  key: number;
  type: 'same' | 'added' | 'removed';
  text: string;
}

const MAX_MATRIX_CELLS = 1_500_000;

const fallbackDiff = (oldLines: string[], newLines: string[]): DiffLine[] => {
  let cursor = 0;
  const line = (type: DiffLine['type'], text: string): DiffLine => ({
    key: cursor++,
    type,
    text
  });
  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  return [
    ...oldLines.slice(0, prefix).map((text) => line('same', text)),
    ...oldLines.slice(prefix, oldLines.length - suffix).map((text) => line('removed', text)),
    ...newLines.slice(prefix, newLines.length - suffix).map((text) => line('added', text)),
    ...oldLines.slice(oldLines.length - suffix).map((text) => line('same', text))
  ];
};

/**
 * 生成行级 diff；相同行保持上下文，新增和删除分别标记。
 */
export const buildLineDiff = (oldText: string, newText: string): DiffLine[] => {
  let cursor = 0;
  const line = (type: DiffLine['type'], text: string): DiffLine => ({
    key: cursor++,
    type,
    text
  });
  if (oldText === newText) {
    return oldText ? oldText.split('\n').map((text) => line('same', text)) : [];
  }

  const oldLines = oldText ? oldText.split('\n') : [];
  const newLines = newText ? newText.split('\n') : [];
  if (oldLines.length === 0) return newLines.map((text) => line('added', text));
  if (newLines.length === 0) return oldLines.map((text) => line('removed', text));
  if (oldLines.length * newLines.length > MAX_MATRIX_CELLS) {
    return fallbackDiff(oldLines, newLines);
  }

  const width = newLines.length + 1;
  const table = new Uint32Array((oldLines.length + 1) * width);
  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      table[oldIndex * width + newIndex] =
        oldLines[oldIndex] === newLines[newIndex]
          ? table[(oldIndex + 1) * width + newIndex + 1]! + 1
          : Math.max(
              table[(oldIndex + 1) * width + newIndex]!,
              table[oldIndex * width + newIndex + 1]!
            );
    }
  }

  const result: DiffLine[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < oldLines.length && newIndex < newLines.length) {
    if (oldLines[oldIndex] === newLines[newIndex]) {
      result.push(line('same', oldLines[oldIndex]!));
      oldIndex += 1;
      newIndex += 1;
    } else if (
      table[(oldIndex + 1) * width + newIndex]! >= table[oldIndex * width + newIndex + 1]!
    ) {
      result.push(line('removed', oldLines[oldIndex]!));
      oldIndex += 1;
    } else {
      result.push(line('added', newLines[newIndex]!));
      newIndex += 1;
    }
  }
  while (oldIndex < oldLines.length) {
    result.push(line('removed', oldLines[oldIndex]!));
    oldIndex += 1;
  }
  while (newIndex < newLines.length) {
    result.push(line('added', newLines[newIndex]!));
    newIndex += 1;
  }
  return result;
};
