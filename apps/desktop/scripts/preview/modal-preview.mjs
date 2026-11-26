/**
 * 弹窗预览器（AGENTS 6.13）：仓库外临时启动 Vite + Electron，直接 import 真实弹窗组件。
 * 不修改 src/**；退出时关闭 Vite、结束 Electron 并删除临时目录。
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, '..', '..');
const repoRoot = resolve(appRoot, '..', '..');
const rendererRoot = join(appRoot, 'src', 'renderer');
const sharedRoot = join(repoRoot, 'packages', 'shared', 'src');

const port = Number(process.env.PREVIEW_PORT ?? 5399);
const debugPort = Number(process.env.PREVIEW_DEBUG_PORT ?? 9399);

const require = createRequire(join(appRoot, 'package.json'));
const { createServer } = await import(require.resolve('vite'));
const vuePlugin = (await import(require.resolve('@vitejs/plugin-vue'))).default;
const electronPath = require('electron');

const tempDir = await mkdtemp(join(tmpdir(), 'nexus-modal-preview-'));
const entryPath = join(tempDir, 'entry.ts');
const sfcPath = join(tempDir, 'PreviewRoot.vue');
const electronDir = join(tempDir, 'electron');
await mkdir(electronDir, { recursive: true });

// 假数据（长内容，便于测试滚动）
const longText = Array.from(
  { length: 160 },
  (_, i) => `第 ${i + 1} 行：这是一段用于测试滚动条的长文本内容。`
).join('\n');

const providers = Array.from({ length: 12 }, (_, i) => ({
  id: `provider-${i + 1}`,
  protocol: i % 4 === 3 ? 'anthropic' : 'openai',
  name:
    i === 0
      ? '腾讯云 TokenHub'
      : i === 1
        ? 'DeepSeek（Anthropic）'
        : `示例供应商 ${i + 1}`,
  baseUrl: `https://api.provider${i + 1}.com/v1`,
  apiKey: 'sk-preview',
  enabled: i % 3 !== 0,
  models: Array.from({ length: 4 + (i % 5) }, (_, j) => ({
    id: `model-${i + 1}-${j + 1}`,
    contextWindow: 1_000_000,
    maxOutputTokens: 131_072,
    ...(j % 2 === 0 ? { reasoningPassback: true } : {})
  })),
  defaultModelId: `model-${i + 1}-1`
}));

const sources = Array.from({ length: 14 }, (_, i) => ({
  id: `src-${i}`,
  name: `知识来源 ${i + 1}.md`,
  kind: 'file',
  originPath: `/docs/${i + 1}.md`,
  mime: 'text/markdown',
  bytes: 12_000 + i * 100,
  chunkCount: 20 + i,
  status: 'ready',
  createdAt: Date.now() - i * 1000,
  updatedAt: Date.now()
}));

const plugins = Array.from({ length: 10 }, (_, i) => ({
  id: `nexus.plugin-${i}`,
  name: `示例插件 ${i + 1}`,
  version: `1.0.${i}`,
  description: '用于预览滚动效果的示例插件',
  enabled: i % 2 === 0,
  source: i % 3 === 0 ? 'builtin' : 'user',
  permissions: ['storage', 'ui.panel'],
  activationEvents: ['onView:panel'],
  contributes: { views: [{ id: 'panel', title: '面板' }] },
  hasMain: false,
  mainLoaded: false
}));

const transcript = [];
for (let i = 0; i < 24; i += 1) {
  transcript.push({ role: 'user', content: `第 ${i} 步：请继续处理。` });
  transcript.push({
    role: 'assistant',
    content: `已完成第 ${i} 步。`,
    reasoning: '这是用于测试的推理内容。',
    toolCalls: [{ id: `call-${i}`, name: 'read_file', arguments: { path: `f${i}.txt` } }]
  });
  transcript.push({ role: 'tool', toolCallId: `call-${i}`, content: `结果 ${i}` });
}

const bridgeDefaults = {
  'app.getInfo': { version: '0.0.1-preview', name: 'Nexus', platform: 'darwin' },
  'app.consumePendingSession': null,
  'theme.getInfo': { source: 'system', effective: 'light' },
  'settings.getImage': {
    configs: Array.from({ length: 12 }, (_, i) => ({
      id: `image-${i + 1}`,
      name: `图像模型 ${i + 1}`,
      model: `image-model-${i + 1}`,
      enabled: i % 3 !== 0,
      template: {
        url: `https://api.image${i + 1}.com/generate`,
        method: 'POST',
        body: { model: '{{model}}', prompt: '{{prompt}}', size: '{{size}}' },
        result: { paths: ['data.0.url'], encoding: 'auto' }
      }
    }))
  },
  'settings.getSearch': null,
  'settings.getSkin': null,
  'settings.getStartup': null,
  'mcp.load': JSON.stringify({
    mcpServers: Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [
        `server-${i + 1}`,
        {
          command: 'npx',
          args: ['-y', `@modelcontextprotocol/server-${i + 1}`],
          enabled: i % 4 !== 0
        }
      ])
    )
  }),
  'mcp.status': Array.from({ length: 12 }, (_, i) => ({
    id: `server-${i + 1}`,
    enabled: i % 4 !== 0,
    connected: i % 3 === 0,
    tools: i + 1
  })),
  'memory.getSettings': { autoCapture: true, retrieval: true },
  'memory.list': Array.from({ length: 14 }, (_, i) => ({
    id: `memory-${i + 1}`,
    kind: ['preference', 'fact', 'decision', 'context'][i % 4],
    title: `记忆条目 ${i + 1}`,
    content: `这是第 ${i + 1} 条长期记忆内容，用于预览记忆列表的滚动效果。`,
    status: 'active',
    priority: i % 5,
    createdAt: Date.now() - i * 1000,
    updatedAt: Date.now() - i * 500
  })),
  'provider.list': providers,
  'knowledge.list': sources,
  'plugin.list': plugins,
  'files.read': {
    fileId: 'file-1',
    name: 'report.md',
    mime: 'text/markdown',
    bytes: Buffer.byteLength(longText, 'utf8'),
    base64: Buffer.from(longText, 'utf8').toString('base64')
  },
  'artifact.meta': { artifactId: 'artifact-1', label: '子代理过程', bytes: 4096 },
  'artifact.read': {
    artifactId: 'artifact-1',
    label: '子代理过程',
    bytes: 4096,
    content: JSON.stringify({ messages: transcript, approvals: [] })
  }
};

const PREVIEW_HTML = `<!doctype html>
<html lang="zh-CN" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <title>Nexus Modal Preview</title>
  </head>
  <body>
    <div id="app"></div>
    <script>
      // AGENTS 6.13：最前面 stub IPC；具体 API 返回 { ok: true, data }。
      (function () {
        var DEFAULTS = ${JSON.stringify(bridgeDefaults)};
        function makeResult(path) {
          var key = path.join('.');
          if (Object.prototype.hasOwnProperty.call(DEFAULTS, key)) {
            return { ok: true, data: DEFAULTS[key] };
          }
          if (key.indexOf('list') !== -1) return { ok: true, data: [] };
          return { ok: true, data: null };
        }
        function makeNode(path) {
          return new Proxy(function () {}, {
            get: function (_t, prop) {
              if (prop === 'then') return undefined;
              if (typeof prop === 'symbol') return undefined;
              if (prop === 'constructor') return undefined;
              if (typeof prop === 'string' && prop.indexOf('on') === 0) {
                return function () { return function () {}; };
              }
              return makeNode(path.concat([String(prop)]));
            },
            apply: function () {
              return Promise.resolve(makeResult(path));
            }
          });
        }
        window.takeNexusBridge = function () { return makeNode([]); };
      })();
    </script>
    <script type="module" src="/__preview_entry.ts"></script>
  </body>
</html>
`;

const ENTRY_TS = `import { createPinia } from 'pinia';
import { createApp } from 'vue';
import '@/styles/global.less';
import PreviewRoot from '@preview';

createApp(PreviewRoot).use(createPinia()).mount('#app');
`;

const ELECTRON_MAIN = `const { app, BrowserWindow } = require('electron');

app.commandLine.appendSwitch('remote-debugging-port', process.env.PREVIEW_DEBUG_PORT || '9399');
app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1180,
    height: 860,
    title: 'Nexus Modal Preview',
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  win.loadURL(process.env.PREVIEW_URL);
});
app.on('window-all-closed', () => app.quit());
`;

await writeFile(entryPath, ENTRY_TS);
await writeFile(sfcPath, await readFile(join(scriptDir, 'preview-root.vue'), 'utf8'));
await writeFile(join(electronDir, 'main.cjs'), ELECTRON_MAIN);

/** 虚拟插件：提供 /__preview.html 与 /__preview_entry.ts。 */
const previewPlugin = {
  name: 'nexus-modal-preview',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = (req.url || '').split('?')[0];
      if (url === '/__preview.html') {
        res.setHeader('Content-Type', 'text/html');
        res.end(PREVIEW_HTML);
        return;
      }
      if (url === '/__preview_entry.ts') {
        // 转由 Vite 通过 /@fs 加载并转译真实入口
        res.setHeader('Content-Type', 'application/javascript');
        res.end(`import ${JSON.stringify(`/@fs${entryPath}`)};`);
        return;
      }
      next();
    });
  }
};

const server = await createServer({
  configFile: false,
  root: rendererRoot,
  logLevel: 'info',
  server: { port, strictPort: true, fs: { allow: [repoRoot, tempDir] } },
  plugins: [vuePlugin(), previewPlugin],
  resolve: {
    dedupe: ['vue', 'pinia', 'naive-ui'],
    alias: {
      '@': rendererRoot,
      '@shared': sharedRoot,
      '@preview': sfcPath
    }
  }
});
await server.listen();
const url = `http://localhost:${port}/__preview.html`;

const electron = spawn(electronPath, [join(electronDir, 'main.cjs')], {
  cwd: appRoot,
  stdio: 'inherit',
  env: { ...process.env, PREVIEW_URL: url, PREVIEW_DEBUG_PORT: String(debugPort) }
});

let stopping = false;
const cleanup = async () => {
  if (stopping) return;
  stopping = true;
  try {
    electron.kill('SIGTERM');
  } catch {
    // ignore
  }
  try {
    await server.close();
  } catch {
    // ignore
  }
  await rm(tempDir, { recursive: true, force: true });
};

process.on('SIGINT', () => cleanup().then(() => process.exit(0)));
process.on('SIGTERM', () => cleanup().then(() => process.exit(0)));
electron.on('exit', () => {
  cleanup().then(() => process.exit(0));
});

// eslint-disable-next-line no-console
console.log(`Nexus modal preview: ${url} (CDP :${debugPort})`);
