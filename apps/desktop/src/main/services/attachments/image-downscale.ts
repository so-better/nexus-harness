/**
 * 图片降采样：发送给模型前按最大边长缩放，降低视觉 token 与请求体积。
 * 使用 Electron nativeImage 解码；非 Electron 环境或解码失败时回退为原图。
 */

const MAX_IMAGE_SIDE = 1_568;
const JPEG_QUALITY = 82;

export interface DownscaledImage {
  data: string;
  mimeType: string;
}

/**
 * 将图片缩放到最长边不超过 1568px；未超限或无法解码时原样返回 base64。
 */
export const downscaleImage = async (
  buffer: Buffer,
  mimeType: string
): Promise<DownscaledImage> => {
  const original = buffer.toString('base64');
  // 仅 Electron 主进程有 nativeImage；测试/纯 Node 环境直接回退
  if (!process.versions.electron) return { data: original, mimeType };

  try {
    const { nativeImage } = await import('electron');
    const image = nativeImage.createFromBuffer(buffer);
    const { width, height } = image.getSize();
    if (!width || !height) return { data: original, mimeType };

    const maxSide = Math.max(width, height);
    if (maxSide <= MAX_IMAGE_SIDE) return { data: original, mimeType };

    const scale = MAX_IMAGE_SIDE / maxSide;
    const resized = image.resize({
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
      quality: 'good'
    });

    const keepPng = mimeType === 'image/png';
    const encoded = keepPng ? resized.toPNG() : resized.toJPEG(JPEG_QUALITY);
    if (!encoded.length) return { data: original, mimeType };
    return {
      data: encoded.toString('base64'),
      mimeType: keepPng ? 'image/png' : 'image/jpeg'
    };
  } catch {
    return { data: original, mimeType };
  }
};
