// @vitest-environment jsdom
vi.hoisted(() => {
  (window as unknown as { takeNexusBridge: () => object }).takeNexusBridge = () => ({});
});
/**
 * 知识库弹窗：加载来源、空态与检索结果。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { NMessageProvider } from 'naive-ui';
import type { KnowledgeSource } from '@shared/knowledge';

vi.mock('../api/knowledge.api', () => ({
  listKnowledge: vi.fn(),
  importKnowledgeFiles: vi.fn(),
  scanKnowledgeDirectory: vi.fn(),
  importKnowledgeDirectory: vi.fn(),
  removeKnowledge: vi.fn(),
  reindexKnowledge: vi.fn(),
  openKnowledgeSource: vi.fn(),
  onKnowledgeChanged: vi.fn(() => () => undefined)
}));

import {
  importKnowledgeDirectory,
  listKnowledge,
  scanKnowledgeDirectory
} from '../api/knowledge.api';
import KnowledgeModal from './KnowledgeModal.vue';

const source: KnowledgeSource = {
  id: 'source-1',
  name: '架构说明.md',
  kind: 'file',
  originPath: '/tmp/architecture.md',
  bytes: 2048,
  chunkCount: 3,
  status: 'ready',
  createdAt: 1,
  updatedAt: 1
};

const flush = async (): Promise<void> => {
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
};

const mount = (): HTMLElement => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  createApp({
    render: () =>
      h(NMessageProvider, null, {
        default: () => h(KnowledgeModal, { show: true, 'onUpdate:show': () => undefined })
      })
  }).mount(host);
  return host;
};

describe('KnowledgeModal', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.mocked(listKnowledge).mockReset();
    vi.mocked(scanKnowledgeDirectory).mockReset();
    vi.mocked(importKnowledgeDirectory).mockReset();
  });

  it('loads and displays knowledge sources', async () => {
    vi.mocked(listKnowledge).mockResolvedValue([source]);
    mount();
    await flush();

    expect(document.body.textContent).toContain('架构说明.md');
    expect(document.body.textContent).toContain('3 个片段');
  });

  it('shows the empty state when there are no sources', async () => {
    vi.mocked(listKnowledge).mockResolvedValue([]);
    mount();
    await flush();

    expect(document.body.textContent).toContain('还没有知识库来源');
    expect(document.body.textContent).toContain('导入文件');
  });

  it('shows a directory confirmation and can cancel it', async () => {
    vi.mocked(listKnowledge).mockResolvedValue([]);
    vi.mocked(scanKnowledgeDirectory).mockResolvedValue({
      token: 'scan-1',
      path: '/tmp/docs',
      fileCount: 2,
      totalBytes: 4096,
      skipped: 1,
      errors: []
    });
    mount();
    await flush();

    document.querySelectorAll<HTMLButtonElement>('.nh-knowledge__actions button')[1]?.click();
    await flush();
    expect(document.body.textContent).toContain('导入目录预览');
    expect(document.body.textContent).toContain('将导入 2 个文件');

    document.querySelectorAll<HTMLButtonElement>('.nh-knowledge__scan-actions button')[0]?.click();
    await flush();
    expect(document.querySelector('.nh-knowledge__scan')).toBeNull();
  });

  it('imports the confirmed directory with the scan token', async () => {
    vi.mocked(listKnowledge).mockResolvedValue([]);
    vi.mocked(scanKnowledgeDirectory).mockResolvedValue({
      token: 'scan-2',
      path: '/tmp/docs',
      fileCount: 1,
      totalBytes: 1024,
      skipped: 0,
      errors: []
    });
    vi.mocked(importKnowledgeDirectory).mockResolvedValue({ sources: [], errors: [] });
    mount();
    await flush();

    document.querySelectorAll<HTMLButtonElement>('.nh-knowledge__actions button')[1]?.click();
    await flush();
    const confirm = document.querySelectorAll<HTMLButtonElement>(
      '.nh-knowledge__scan-actions button'
    );
    confirm[confirm.length - 1]?.click();
    await flush();

    expect(importKnowledgeDirectory).toHaveBeenCalledWith({ token: 'scan-2' });
    expect(document.querySelector('.nh-knowledge__scan')).toBeNull();
  });
});
