// @vitest-environment jsdom
/**
 * 导出会话：渲染层确认、防重复打开与确认后只导出一次。
 */
import { ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  dialogInfo: vi.fn(),
  exportSession: vi.fn(async () => ({ saved: true }))
}));

vi.mock('pinia', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    storeToRefs: (store: Record<string, unknown>) => store
  };
});

vi.mock('naive-ui', () => ({
  useMessage: () => ({ success: vi.fn(), error: vi.fn() }),
  useDialog: () => ({ info: state.dialogInfo })
}));

vi.mock('@/modules/session/stores/session.store', () => ({
  useSessionStore: () => ({
    activeId: ref('session-1'),
    sessions: ref([{ id: 'session-1' }])
  })
}));

vi.mock('@/modules/chat/stores/chat.store', () => ({
  useChatStore: () => ({ providerId: ref('provider-1'), modelId: ref('model-1') })
}));

vi.mock('@/modules/session/api/session.api', () => ({
  exportSession: state.exportSession
}));

import { useMainSessionActions } from './use-main-session-actions';

describe('useMainSessionActions export', () => {
  beforeEach(() => {
    state.dialogInfo.mockReset();
    state.exportSession.mockClear();
  });

  it('clears the busy state when export confirmation is cancelled', async () => {
    const actions = useMainSessionActions();
    await actions.exportActiveSession('markdown');

    const options = state.dialogInfo.mock.calls[0]?.[0] as {
      onNegativeClick: () => void;
    };
    expect(actions.exporting.value).toBe(true);
    options.onNegativeClick();
    expect(actions.exporting.value).toBe(false);
    expect(state.exportSession).not.toHaveBeenCalled();
  });

  it('opens one renderer confirmation and exports once after approval', async () => {
    const actions = useMainSessionActions();
    await actions.exportActiveSession('markdown');
    await actions.exportActiveSession('html');

    expect(state.dialogInfo).toHaveBeenCalledTimes(1);
    const options = state.dialogInfo.mock.calls[0]?.[0] as {
      content: string;
      onPositiveClick: () => Promise<void>;
    };
    expect(options.content).toContain('MARKDOWN');
    expect(state.exportSession).not.toHaveBeenCalled();

    await options.onPositiveClick();
    expect(state.exportSession).toHaveBeenCalledTimes(1);
    expect(state.exportSession).toHaveBeenCalledWith('session-1', 'markdown');
  });
});
