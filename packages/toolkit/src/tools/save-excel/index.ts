/**
 * Excel 生成：工作表数据渲染为 xlsx。
 */

import ExcelJS from 'exceljs';
import { resolveFonts } from '../../document/fonts';
import type { ExcelDocumentInput } from '../../document/types';

/** 保证工作表名合法且唯一（Excel 限制 31 字符、不能重名） */
const safeSheetName = (name: string, index: number, used: Set<string>) => {
  const base =
    (name || `Sheet${index + 1}`)
      .replace(/[\\/?*[\]:]/g, ' ')
      .trim()
      .slice(0, 31) || `Sheet${index + 1}`;
  let final = base;
  let suffix = 1;
  while (used.has(final)) {
    const tag = `(${suffix++})`;
    final = `${base.slice(0, 31 - tag.length)}${tag}`;
  }
  used.add(final);
  return final;
};

/** 生成 xlsx 文件内容 */
const buildXlsx = async (
  sheets: Array<{ name: string; rows: Array<Array<string | number | boolean | null>> }>,
  cjk: string
) => {
  const workbook = new ExcelJS.Workbook();
  const used = new Set<string>();

  sheets.forEach((sheet, index) => {
    const worksheet = workbook.addWorksheet(safeSheetName(sheet.name, index, used));
    sheet.rows.forEach((row) => worksheet.addRow(row));

    if (sheet.rows.length) {
      // 统一中文字体（Office 缺失时会自动替换）
      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.font = { name: cjk };
        });
      });
      worksheet.getRow(1).font = { bold: true, name: cjk };
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    }

    const columnCount = sheet.rows.reduce((max, row) => Math.max(max, row.length), 0);
    for (let c = 1; c <= columnCount; c++) {
      let width = 10;
      for (const row of sheet.rows) {
        const value = row[c - 1];
        const length = value === null || value === undefined ? 0 : String(value).length;
        width = Math.max(width, Math.min(50, length + 2));
      }
      worksheet.getColumn(c).width = width;
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
};

/**
 * 生成 Excel 工作簿。
 */
export const createExcelBuffer = async (input: ExcelDocumentInput): Promise<Buffer> =>
  buildXlsx(input.sheets, resolveFonts(input.platform).cjk);
