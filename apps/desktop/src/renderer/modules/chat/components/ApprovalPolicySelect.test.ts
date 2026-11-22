// @vitest-environment jsdom
/**
 * 审批策略选择：工作区信任必须可用，选择后回传策略。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import ApprovalPolicySelect from './ApprovalPolicySelect.vue';

const flush = async (): Promise<void> => {
  await nextTick();
  await nextTick();
};

describe('ApprovalPolicySelect', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('disables workspace trust without a workspace and emits a policy change', async () => {
    const update = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(ApprovalPolicySelect, {
      approvalPolicy: 'ask',
      disabled: false,
      hasWorkspace: false,
      onUpdateApprovalPolicy: update
    });
    app.mount(host);
    await flush();

    host.querySelector<HTMLButtonElement>('.nh-approval-select')?.click();
    await flush();

    const options = [...document.querySelectorAll<HTMLButtonElement>('.nh-approval-option')];
    const workspace = options.find((item) => item.textContent?.includes('工作区信任'));
    const always = options.find((item) => item.textContent?.includes('始终信任'));
    expect(workspace?.disabled).toBe(true);
    always?.click();
    expect(update).toHaveBeenCalledWith('always');
    app.unmount();
  });
});
