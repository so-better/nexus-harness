/**
 * save_ppt 测试：模板化版式生成 PPTX。
 */

import { describe, expect, it } from 'vitest';
import { createPptBuffer } from './index';

describe('save_ppt', () => {
  it('creates a PPTX buffer with template layouts', async () => {
    const ppt = await createPptBuffer({
      title: 'Deck',
      slides: [
        { layout: 'bullets', title: 'Slide', items: ['A'] },
        { layout: 'kpi', title: 'Metrics', kpis: [{ value: '99%', label: 'Done' }] }
      ]
    });
    expect(ppt.subarray(0, 2).toString()).toBe('PK');
  });

  it('rejects invalid slide data', async () => {
    await expect(
      createPptBuffer({ slides: [{ title: 'missing layout' }] } as never)
    ).rejects.toThrow();
  });
});
