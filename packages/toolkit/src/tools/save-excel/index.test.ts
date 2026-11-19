/**
 * save_excel 测试：生成 XLSX。
 */

import { describe, expect, it } from 'vitest';
import { createExcelBuffer } from './index';

describe('save_excel', () => {
  it('creates an XLSX buffer', async () => {
    const excel = await createExcelBuffer({
      sheets: [
        {
          name: 'Sheet1',
          rows: [
            ['Name', 'Value'],
            ['A', 1]
          ]
        }
      ]
    });
    expect(excel.subarray(0, 2).toString()).toBe('PK');
  });
});
