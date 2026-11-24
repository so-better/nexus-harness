import { _electron as electron } from 'playwright-core';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const appDir = join(repo, 'apps/desktop');
const requireFromApp = createRequire(join(appDir, 'package.json'));

const home = await mkdtemp(join(tmpdir(), 'nexus-full-e2e-'));
const userData = join(home, 'NexusE2E');
const settings = join(userData, 'settings');
const workspace = join(home, 'workspace');
await mkdir(settings, { recursive: true });
await mkdir(workspace, { recursive: true });
await writeFile(join(workspace, 'note.txt'), 'initial', 'utf8');

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });

const server = createServer(async (req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(404);
    res.end();
    return;
  }
  const body = JSON.parse((await readBody(req)) || '{}');
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const hadToolResult = messages.at(-1)?.role === 'tool';
  const prompt = [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  const text = (value) =>
    `data: ${JSON.stringify({ id: 'mock', choices: [{ index: 0, delta: { content: value }, finish_reason: null }] })}\n\n`;
  const finish = (reason = 'stop') =>
    `data: ${JSON.stringify({ id: 'mock', choices: [{ index: 0, delta: {}, finish_reason: reason }] })}\n\n`;

  if (String(prompt).includes('WRITE_REJECT_TEST') && !hadToolResult) {
    res.write(
      `data: ${JSON.stringify({
        id: 'mock',
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_write_reject',
                  type: 'function',
                  function: {
                    name: 'write_file',
                    arguments: JSON.stringify({
                      path: 'note.txt',
                      content: 'should not be written'
                    })
                  }
                }
              ]
            },
            finish_reason: null
          }
        ]
      })}\n\n`
    );
    res.write(finish('tool_calls'));
    res.write(
      `data: ${JSON.stringify({ id: 'mock', choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } })}\n\n`
    );
    res.end('data: [DONE]\n\n');
    return;
  }
  if (String(prompt).includes('WRITE_TEST') && !hadToolResult) {
    res.write(
      `data: ${JSON.stringify({
        id: 'mock',
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_write_file',
                  type: 'function',
                  function: {
                    name: 'write_file',
                    arguments: JSON.stringify({
                      path: 'note.txt',
                      content: 'changed by e2e'
                    })
                  }
                }
              ]
            },
            finish_reason: null
          }
        ]
      })}\n\n`
    );
    res.write(finish('tool_calls'));
    res.write(
      `data: ${JSON.stringify({ id: 'mock', choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } })}\n\n`
    );
    res.end('data: [DONE]\n\n');
    return;
  }
  if (String(prompt).includes('OPEN_URL_TEST') && !hadToolResult) {
    res.write(
      `data: ${JSON.stringify({
        id: 'mock',
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_open_url',
                  type: 'function',
                  function: {
                    name: 'open_url',
                    arguments: JSON.stringify({ url: 'https://example.com' })
                  }
                }
              ]
            },
            finish_reason: null
          }
        ]
      })}\n\n`
    );
    res.write(finish('tool_calls'));
    res.write(
      `data: ${JSON.stringify({ id: 'mock', choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } })}\n\n`
    );
    res.end('data: [DONE]\n\n');
    return;
  }
  const responseText = hadToolResult
    ? String(prompt).includes('WRITE_REJECT_TEST')
      ? 'E2E_WRITE_REJECTED_OK'
      : String(prompt).includes('WRITE_TEST')
        ? 'E2E_WRITE_OK'
        : 'E2E_REJECTED_OK'
    : 'E2E_OK';
  res.write(text(responseText));
  res.write(finish('stop'));
  res.write(
    `data: ${JSON.stringify({ id: 'mock', choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } })}\n\n`
  );
  res.end('data: [DONE]\n\n');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

await writeFile(
  join(settings, 'providers.json'),
  JSON.stringify({
    version: 1,
    providers: [
      {
        id: 'mock',
        protocol: 'openai',
        name: 'Mock',
        baseUrl: `http://127.0.0.1:${port}/v1`,
        apiKey: 'test',
        enabled: true,
        models: [{ id: 'mock-model', contextWindow: 131072, maxOutputTokens: 8192 }],
        defaultModelId: 'mock-model'
      }
    ]
  }),
  'utf8'
);

const electronPath = requireFromApp('electron');
const app = await electron.launch({
  executablePath: electronPath,
  args: [appDir],
  env: { ...process.env, NEXUS_E2E_USER_DATA: userData },
  timeout: 60000
});
const report = {};
try {
  const win = await app.firstWindow({ timeout: 60000 });
  await win.waitForLoadState('domcontentloaded');
  report.userData = await app.evaluate(({ app }) => app.getPath('userData'));
  report.title = await win.title();
  report.initial = (await win.locator('body').innerText()).slice(0, 200);

  const textarea = win.locator('.nh-composer textarea');
  await textarea.fill('E2E_SMOKE');
  await win.getByRole('button', { name: '发送' }).click();
  await win.waitForFunction(() => document.body.innerText.includes('E2E_OK'), { timeout: 30000 });
  report.chat = true;

  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, workspace);
  await win.getByRole('button', { name: '添加工作区' }).click();
  await win.waitForTimeout(700);

  await textarea.fill('WRITE_TEST');
  await win.getByRole('button', { name: '发送' }).click();
  await win.getByRole('button', { name: '允许' }).waitFor({ timeout: 30000 });
  report.writeApprovalVisible = true;
  await win.getByRole('button', { name: '允许' }).click();
  await win.waitForFunction(() => document.body.innerText.includes('E2E_WRITE_OK'), {
    timeout: 30000
  });
  report.writeApproved = (await readFile(join(workspace, 'note.txt'), 'utf8')) === 'changed by e2e';

  await textarea.fill('WRITE_REJECT_TEST');
  await win.getByRole('button', { name: '发送' }).click();
  await win.getByRole('button', { name: '拒绝' }).waitFor({ timeout: 30000 });
  report.writeRejectVisible = true;
  await win.getByRole('button', { name: '拒绝' }).click();
  await win.waitForFunction(() => document.body.innerText.includes('E2E_WRITE_REJECTED_OK'), {
    timeout: 30000
  });
  report.writeRejected = (await readFile(join(workspace, 'note.txt'), 'utf8')) === 'changed by e2e';

  await win.waitForTimeout(1500);
  await textarea.fill('OPEN_URL_TEST');
  await win.getByRole('button', { name: '发送' }).click();
  await win.waitForTimeout(2500);
  await win.getByRole('button', { name: '拒绝' }).waitFor({ timeout: 30000 });
  report.approvalVisible = true;
  await win.getByRole('button', { name: '拒绝' }).click();
  await win.waitForFunction(() => document.body.innerText.includes('E2E_REJECTED_OK'), {
    timeout: 30000
  });
  report.approvalRejected = true;

  await win.getByRole('button', { name: '知识库' }).click();
  await win.locator('.nh-knowledge').waitFor({ timeout: 10000 });
  report.knowledgeModal = true;

  await win.evaluate(() => document.querySelector('.nh-knowledge .n-base-close')?.click());
  await win.getByRole('button', { name: '终端' }).click();
  await win.locator('.nh-terminal-panel').waitFor({ timeout: 10000 });
  report.terminalPanel = true;
  await win.waitForTimeout(500);
  app.process().kill('SIGKILL');
  await new Promise((resolve) => setTimeout(resolve, 800));
  const restored = await electron.launch({
    executablePath: electronPath,
    args: [appDir],
    env: { ...process.env, NEXUS_E2E_USER_DATA: userData },
    timeout: 60000
  });
  try {
    const restoredWin = await restored.firstWindow({ timeout: 60000 });
    await restoredWin.waitForLoadState('domcontentloaded');
    await restoredWin.waitForFunction(() => document.body.innerText.includes('E2E_OK'), {
      timeout: 30000
    });
    report.sessionRestored = true;
  } finally {
    await restored.close().catch(() => undefined);
  }
} catch (error) {
  report.error = error instanceof Error ? error.stack : String(error);
} finally {
  console.log('FULL E2E', JSON.stringify(report, null, 2));
  await app.close().catch(() => undefined);
  server.close();
  await rm(home, { recursive: true, force: true });
  if (
    report.error ||
    !report.chat ||
    !report.approvalVisible ||
    !report.approvalRejected ||
    !report.writeApprovalVisible ||
    !report.writeApproved ||
    !report.writeRejectVisible ||
    !report.writeRejected ||
    !report.knowledgeModal ||
    !report.terminalPanel ||
    !report.sessionRestored
  ) {
    process.exitCode = 1;
  }
}
