/**
 * 本地二进制文件读取：按类型抽取文本，避免把原始二进制注入上下文。
 */

import { extname } from 'node:path';
import { readFile } from 'node:fs/promises';

const MAX_ARCHIVE_ENTRIES = 100;
const MAX_EXTRACTED_BYTES = 2_000_000;

/**
 * 去除 XML 标签并合并空白。
 */
const xmlText = (xml: string): string =>
  xml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * 从 Office Open XML 的压缩包中抽取 XML 文本。
 */
const readOfficeXml = async (buffer: Buffer, pattern: RegExp): Promise<string> => {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buffer);
  const files = Object.values(zip.files).filter((file) => !file.dir && pattern.test(file.name));
  let output = '';
  let extracted = 0;
  for (const file of files.slice(0, MAX_ARCHIVE_ENTRIES)) {
    // 先检查 ZIP 元数据中的解压后大小，避免压缩炸弹在解压后才被拦截
    const uncompressedSize = (file as { _data?: { uncompressedSize?: number } })._data
      ?.uncompressedSize;
    if (uncompressedSize !== undefined && extracted + uncompressedSize > MAX_EXTRACTED_BYTES) {
      output += '\n...[内容超过上限已截断]';
      break;
    }
    const text = xmlText(await file.async('string'));
    if (!text) continue;
    extracted += Buffer.byteLength(text, 'utf8');
    if (extracted > MAX_EXTRACTED_BYTES) {
      output += '\n...[内容超过上限已截断]';
      break;
    }
    output += `${text}\n`;
  }
  return output.trim();
};

/**
 * 读取 ZIP 条目列表，不把条目内容注入上下文。
 */
const readZipListing = async (buffer: Buffer): Promise<string> => {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buffer);
  const files = Object.values(zip.files).filter((file) => !file.dir);
  const lines = files.slice(0, MAX_ARCHIVE_ENTRIES).map((file) => file.name);
  if (files.length > MAX_ARCHIVE_ENTRIES) lines.push('...[条目超过上限已截断]');
  return lines.join('\n');
};

/**
 * 根据扩展名抽取可读文本；不支持的类型返回 undefined。
 */
export const extractBinaryText = async (
  path: string,
  buffer: Buffer
): Promise<string | undefined> => {
  const extension = extname(path).toLowerCase();

  if (extension === '.pdf') {
    const [{ PDFParse }, worker] = await Promise.all([
      import('pdf-parse'),
      import('pdfjs-dist/legacy/build/pdf.worker.mjs')
    ]);
    // Electron 主进程没有浏览器 Worker，直接把 pdfjs worker 注入主线程，避免打包后 worker 路径丢失
    (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText({ first: 200 });
      return result.text.trim();
    } finally {
      await parser.destroy();
    }
  }

  if (extension === '.docx') {
    const { default: mammoth } = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }

  if (extension === '.xlsx' || extension === '.xls') {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    return workbook.SheetNames.slice(0, 20)
      .map(
        (name) =>
          `# ${name}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name]!, { blankrows: false })}`
      )
      .join('\n\n')
      .trim();
  }

  if (extension === '.pptx') {
    return readOfficeXml(buffer, /^ppt\/slides\/slide\d+\.xml$/);
  }

  if (extension === '.zip') {
    return readZipListing(buffer);
  }

  return undefined;
};

/**
 * 读取本地文件并抽取文本；仅用于受 root 限制的路径。
 */
export const readTextFileOrExtract = async (
  path: string,
  maxBytes: number
): Promise<{ output: string; truncated: boolean; extracted: boolean }> => {
  const buffer = await readFile(path);
  const extracted = await extractBinaryText(path, buffer);
  if (extracted !== undefined) {
    const encoded = Buffer.from(extracted, 'utf8');
    const truncated = encoded.byteLength > maxBytes;
    return {
      output: truncated
        ? `${encoded.subarray(0, maxBytes).toString('utf8')}\n\n...[已截断]`
        : extracted,
      truncated,
      extracted: true
    };
  }
  if (buffer.includes(0)) throw new Error('BINARY_FILE');
  const truncated = buffer.byteLength > maxBytes;
  return {
    output: truncated
      ? `${buffer.subarray(0, maxBytes).toString('utf8')}\n\n...[已截断]`
      : buffer.toString('utf8'),
    truncated,
    extracted: false
  };
};
