/**
 * 从剪贴板提取文件：优先 files，回退到 items，兼容聊天软件粘贴图片。
 */
export const filesFromClipboard = (data: DataTransfer | null): File[] => {
  const files = [...(data?.files ?? [])];
  if (files.length) return files;
  return [...(data?.items ?? [])]
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
};
