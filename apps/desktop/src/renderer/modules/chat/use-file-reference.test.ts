// @vitest-environment jsdom
/**
 * 输入区键盘行为测试：Shift+Enter 必须保留换行，Enter 才提交。
 */

import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./api/workspace.api', () => ({ searchWorkspaceFiles: vi.fn() }));
import type { InputInst } from 'naive-ui';
import { useFileReference } from './use-file-reference';

describe('useFileReference keyboard', () => {
  const create = () => {
    const submit = vi.fn();
    const toggleMode = vi.fn();
    const api = useFileReference({
      draft: ref('text'),
      sessionId: ref(undefined),
      disabled: ref(false),
      running: ref(false),
      enabled: ref(false),
      inputRef: ref<InputInst | null>(null),
      submit,
      toggleMode
    });
    return { api, submit, toggleMode };
  };

  it('does not submit or prevent default on Shift+Enter', () => {
    const { api, submit } = create();
    const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true });
    const preventDefault = vi.spyOn(event, 'preventDefault');

    api.onKeydown(event);

    expect(submit).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('submits on Enter without Shift', () => {
    const { api, submit } = create();
    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    const preventDefault = vi.spyOn(event, 'preventDefault');

    api.onKeydown(event);

    expect(submit).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });
});
