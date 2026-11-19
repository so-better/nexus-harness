/**
 * 终端路径链接解析：支持绝对路径、~ 路径与带引号的含空格路径。
 */

export interface TerminalPathMatch {
  text: string;
  index: number;
}

const PATH_PATTERN =
  /(?:(['"])((?:\/|[A-Za-z]:[\\/]|~\/)[^'"]+)\1)|((?:\/|[A-Za-z]:[\\/]|~\/)[^\s'"`<>|]+)/g;

export const findTerminalPathMatches = (text: string): TerminalPathMatch[] => {
  const matches: TerminalPathMatch[] = [];
  for (const match of text.matchAll(PATH_PATTERN)) {
    const quoted = match[2];
    const value = quoted ?? match[3];
    if (!value || match.index === undefined) continue;
    matches.push({
      text: value,
      index: match.index + (quoted ? 1 : 0)
    });
  }
  return matches;
};
