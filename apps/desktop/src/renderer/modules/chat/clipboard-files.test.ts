// @vitest-environment jsdom
/**
 * 剪贴板文件提取：兼容只暴露 items 的聊天软件粘贴。
 */
import { describe, expect, it } from 'vitest';
import { filesFromClipboard } from './clipboard-files';

const file = new File(['image'], 'pasted.png', { type: 'image/png' });

describe('filesFromClipboard', () => {
  it('uses files when available', () => {
    const data = { files: [file], items: [] } as unknown as DataTransfer;
    expect(filesFromClipboard(data)).toEqual([file]);
  });

  it('falls back to file items when files is empty', () => {
    const data = {
      files: [],
      items: [{ kind: 'file', getAsFile: () => file }]
    } as unknown as DataTransfer;
    expect(filesFromClipboard(data)).toEqual([file]);
  });

  it('ignores non-file items', () => {
    const data = {
      files: [],
      items: [{ kind: 'string', getAsFile: () => null }]
    } as unknown as DataTransfer;
    expect(filesFromClipboard(data)).toEqual([]);
  });
});
