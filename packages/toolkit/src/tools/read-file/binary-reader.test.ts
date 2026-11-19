/**
 * 二进制读取测试：文本、ZIP、Office 与 PDF 的安全抽取。
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readTextFileOrExtract } from './binary-reader';
import { createExcelBuffer, createPdfBuffer, createPptBuffer, createWordBuffer } from '../index';

describe('readTextFileOrExtract', () => {
  let root = '';

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'nexus-binary-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reads plain text and truncates by byte limit', async () => {
    const file = join(root, 'a.txt');
    await writeFile(file, 'hello world');
    const result = await readTextFileOrExtract(file, 5);
    expect(result.output).toContain('hello');
    expect(result.output).toContain('已截断');
  });

  it('lists zip entries instead of injecting binary data', async () => {
    const zip = new JSZip();
    zip.file('a.txt', 'alpha');
    zip.file('b/c.txt', 'beta');
    const file = join(root, 'a.zip');
    await writeFile(file, await zip.generateAsync({ type: 'nodebuffer' }));
    const result = await readTextFileOrExtract(file, 100_000);
    expect(result.output).toContain('a.txt');
    expect(result.output).toContain('b/c.txt');
    expect(result.output).not.toContain('alpha');
  });

  it('extracts Word, Excel, PPT and PDF text', async () => {
    const word = join(root, 'a.docx');
    await writeFile(word, await createWordBuffer({ content: 'Word content' }));
    expect((await readTextFileOrExtract(word, 100_000)).output).toContain('Word content');

    const excel = join(root, 'a.xlsx');
    await writeFile(
      excel,
      await createExcelBuffer({ sheets: [{ name: 'Sheet1', rows: [['Excel content']] }] })
    );
    expect((await readTextFileOrExtract(excel, 100_000)).output).toContain('Excel content');

    const ppt = join(root, 'a.pptx');
    await writeFile(
      ppt,
      await createPptBuffer({ slides: [{ layout: 'bullets', title: 'PPT content' }] })
    );
    expect((await readTextFileOrExtract(ppt, 100_000)).output).toContain('PPT content');

    const pdf = join(root, 'a.pdf');
    await writeFile(pdf, await createPdfBuffer('PDF content'));
    expect((await readTextFileOrExtract(pdf, 100_000)).output).toContain('PDF content');
  }, 20_000);
});
