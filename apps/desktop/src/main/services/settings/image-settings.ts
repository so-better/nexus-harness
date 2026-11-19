/**
 * 图像模型配置存储：保存独立模板列表，与对话 Provider 分离。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { imageSettingsSchema, type ImageSettings } from '@shared/image';
import { getAppDataPaths } from '../storage/paths';

const FILE_NAME = 'image.json';

/**
 * 读取图像配置；旧版单模型配置转换为模板列表。
 */
export const loadImageSettings = async (settingsDir?: string): Promise<ImageSettings | null> => {
  try {
    const raw = await readFile(join(settingsDir ?? getAppDataPaths().settings, FILE_NAME), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    const current = imageSettingsSchema.safeParse(parsed);
    if (current.success) return current.data;

    if (parsed && typeof parsed === 'object' && 'url' in parsed && 'model' in parsed) {
      const legacy = parsed as {
        url?: unknown;
        model?: unknown;
        apiKey?: unknown;
        headers?: unknown;
        resultPath?: unknown;
        resultType?: unknown;
      };
      if (typeof legacy.url === 'string' && typeof legacy.model === 'string') {
        return {
          configs: [
            {
              id: 'legacy-image',
              name: legacy.model,
              model: legacy.model,
              ...(typeof legacy.apiKey === 'string' && legacy.apiKey
                ? { apiKey: legacy.apiKey }
                : {}),
              enabled: true,
              template: {
                url: legacy.url,
                method: 'POST',
                ...(legacy.headers && typeof legacy.headers === 'object'
                  ? {
                      headers: Object.fromEntries(
                        Object.entries(legacy.headers).map(([key, value]) => [key, String(value)])
                      )
                    }
                  : {}),
                body: {
                  model: '{{model}}',
                  prompt: '{{prompt}}',
                  size: '{{size}}',
                  images: '{{image_urls}}'
                },
                result: {
                  ...(typeof legacy.resultPath === 'string' && legacy.resultPath
                    ? { path: legacy.resultPath }
                    : {}),
                  encoding:
                    legacy.resultType === 'url' || legacy.resultType === 'base64'
                      ? legacy.resultType
                      : 'auto'
                }
              }
            }
          ]
        };
      }
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * 保存图像配置列表。
 */
export const saveImageSettings = async (
  value: ImageSettings,
  settingsDir?: string
): Promise<ImageSettings> => {
  const parsed = imageSettingsSchema.parse(value);
  const directory = settingsDir ?? getAppDataPaths().settings;
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, FILE_NAME), `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  return parsed;
};
