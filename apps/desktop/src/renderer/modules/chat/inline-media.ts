/**
 * 内联媒体判定：图片与视频在消息里直接展示，超过读取上限时回退为文件卡。
 */
import type { OutputFile } from '@shared/ipc/contracts';

export const INLINE_MEDIA_MAX_BYTES = 20_000_000;

export const isInlineMediaFile = (file: OutputFile): boolean => {
  const mime = file.mime.toLowerCase();
  const isMedia =
    (mime.startsWith('image/') && mime !== 'image/svg+xml') || mime.startsWith('video/');
  return isMedia && file.bytes <= INLINE_MEDIA_MAX_BYTES;
};
