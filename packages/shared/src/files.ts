/**
 * 文件类型辅助：图片扩展名与 MIME 映射。
 */

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
};

/**
 * 根据文件名返回受支持的图片 MIME；不支持时返回 undefined。
 */
export const imageMimeForName = (name: string): string | undefined =>
  IMAGE_MIME_BY_EXTENSION[name.slice(name.lastIndexOf('.')).toLowerCase()];

/**
 * 根据文件名判断是否为可发送给视觉模型的图片。
 */
export const isImageFile = (name: string): boolean => imageMimeForName(name) !== undefined;
