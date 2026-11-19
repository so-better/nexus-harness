/**
 * 用户消息中的文件引用：把输入区追加的 @绝对路径转换为可展示的文件信息。
 */

export interface UserMessageReference {
  path: string;
  name: string;
}

export interface UserMessageParts {
  text: string;
  references: UserMessageReference[];
}

/**
 * 判断字符串是否是绝对路径，兼容 Unix、Windows 盘符与 UNC。
 */
const isAbsolutePath = (value: string): boolean =>
  value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\');

/**
 * 解析一行引用；一行可能包含多个以空格分隔的 @路径。
 */
const parseReferenceLine = (line: string): string[] => {
  if (!line.startsWith('@')) return [];
  const values = line
    .slice(1)
    .split(/\s+@/)
    .map((value) => value.trim())
    .filter(Boolean);
  return values.length > 0 && values.every(isAbsolutePath) ? values : [];
};

/**
 * 从消息末尾剥离文件引用块，保留用户正文。
 */
export const splitUserMessageReferences = (content: string): UserMessageParts => {
  const lines = content.split('\n');
  const paths: string[] = [];
  let end = lines.length;

  while (end > 0) {
    const line = lines[end - 1]?.trim() ?? '';
    const values = parseReferenceLine(line);
    if (!values.length) break;
    paths.unshift(...values);
    end -= 1;
  }

  return {
    text: lines.slice(0, end).join('\n').trimEnd(),
    references: paths.map((path) => ({
      path,
      name: path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
    }))
  };
};
