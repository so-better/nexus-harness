---
name: plugin-development
description: 当用户要创建、修改、调试或发布 Nexus 插件时使用；覆盖本地插件项目、用户插件、内置插件复制、manifest、renderer/main 入口、权限、插槽、事件与验证流程。
metadata:
  tags:
    [
      插件开发,
      plugin,
      manifest,
      renderer,
      main,
      slots,
      views,
      startup,
      permissions,
      usage,
      用户插件
    ]
  version: 1.3.32
  requires: [read, write, execute]
  source: nexus-self-authored
---

# 插件开发

## 目标

帮助用户在 Nexus 中完成一个可加载、可验证、可维护的插件，而不是只生成孤立代码片段。

## 核心边界

- 插件分为 `renderer` 和 `main` 两个入口，可同时存在。
- `renderer` 运行在渲染进程：只能使用 DOM、`ctx` 和插件自带依赖；不能访问 Node、Electron、`window.nexus`。
- `main` 运行在主进程：等同受信本地代码，能力更强，但必须显式启用并经过用户审批。
- 插件依赖必须自行打包进插件目录，不能依赖 `@nexus/*` 或宿主安装目录中的模块。
- 不开放 `workspace:write`、插件注册工具、`menus`/`themes`/`exporters`/`onboarding` 贡献点和网络权限；插件不注册 Agent 工具，外部工具统一通过 MCP 接入。未声明的能力会被宿主拒绝。
- 内置插件只读，不能直接修改；用户插件才可以修改。需要定制内置插件时，先复制成新的用户插件。

## 新插件开发原则

- 新插件默认按本 Skill 从 manifest、入口和贡献点设计，不复制内置插件。
- 内置插件只作为 API、贡献点和实现方式的参考，不是默认模板。
- 只有用户明确要求“基于 / 定制某个内置插件”时，才使用 `plugin_write` 的 `fromPluginId`。
- 不要因为内置插件存在就默认说“参考内置插件 xxx”；先根据需求选择贡献点和权限。
- 宿主会拒绝未读取本 Skill 的 `plugin_write`；先 `read_skill`，再创建或修改。

## 工作流程

1. **确认目标**：插件要解决什么问题、面向哪个界面、是否需要主进程逻辑。
2. **定位项目**：确认插件源码目录、构建命令和现有文件；不要假设用户没有项目。
3. **读取现状**：至少检查 `plugin.json`、入口文件、`package.json`、现有贡献点和权限。
4. **设计 manifest**：先确定 id、入口、activationEvents、permissions 与 contributes。
5. **实现入口**：渲染入口优先保持轻量；耗时操作按需激活，不在 `activate` 中做重初始化。
6. **本地构建**：使用项目已有构建命令；产物必须输出到 manifest 声明的入口路径。
7. **导入/更新**：
   - 从本地目录导入：`plugin_import`，传绝对 `sourceDir`。
   - 直接在用户插件目录开发：`plugin_write`（files / assets / delete 一次提交）。
   - 删除用户插件：`plugin_delete`；内置插件只能停用。
   - 内置插件定制：`plugin_write` 使用 `fromPluginId` 复制为新的用户插件 id，再继续用 `plugin_write` 修改。
8. **刷新和启用**：`plugin_reload`，确认无错误后 `plugin_set_enabled`。
9. **验证**：检查插件是否激活、UI 是否出现、权限是否最小、清理函数是否执行、错误是否显示在扩展页。
10. **交付**：说明文件位置、启用方式、权限、验证结果和剩余风险。

## 目录与入口

```text
<userData>/plugins/<plugin-id>/
├─ plugin.json
├─ dist/
│  ├─ renderer.mjs       # 可选，ESM
│  └─ main.cjs           # 可选，CommonJS
└─ assets/               # 可选，插件资源
```

- 目录名必须与 manifest.id 一致，且 id 使用反向域名，例如 `your.scope.plugin`。
- `engines.nexus` 必须声明兼容的宿主版本范围；宿主加载时校验，不兼容插件会被禁用并显示错误，且不能通过启用开关恢复；修复 manifest 或升级宿主后重新扫描。
- 入口路径必须位于插件目录内。
- 渲染入口通过 `nexus-plugin://` 加载；主进程入口使用 CommonJS。
- 导入或创建后插件默认未启用；用户确认权限后启用。

## Manifest 最小示例

```json
{
  "id": "your.scope.hello",
  "name": "Hello",
  "version": "1.0.0",
  "description": "说明插件做什么，以及用户为什么会启用它。",
  "engines": { "nexus": ">=0.0.1 <0.1.0" },
  "renderer": "dist/renderer.mjs",
  "activationEvents": ["onSlot:hello.footer"],
  "permissions": ["ui.slot"],
  "contributes": {
    "messageSlots": [{ "id": "hello.footer", "location": "message.assistant.footer" }]
  }
}
```

## 入口与生命周期

```js
export function activate(ctx) {
  return () => {
    // 释放 DOM、监听器、定时器和订阅
  };
}

export function deactivate() {
  // 可选清理
}
```

- `activate(ctx)` 可返回清理函数；停用、禁用、热重载或卸载时宿主会释放。
- 渲染入口激活超时为 10 秒；激活失败会自动禁用并显示错误。
- 必须在 `activate` 中尽早抛出可诊断错误，不要静默失败。
- 所有 `mount` 函数必须返回清理函数。

## 激活事件

- `onSlot:<slotId>`：插槽首次渲染时。
- `onEvent:<eventName>`：对应领域事件到来时。
- 状态栏贡献：状态栏首次渲染时。
- 视图/命令贡献：命令调用、`ctx.views.open` 或扩展页打开时。
- 皮肤贡献：用户选择该皮肤时。
- 启动动画贡献：应用启动并发现插件时。
- `activationEvents` 约束 renderer 入口；main 入口随插件启用加载。

## 权限

| 权限              | 能力                                                           |
| ----------------- | -------------------------------------------------------------- |
| `storage`         | 隔离的 `ctx.storage`                                           |
| `secrets`         | 加密密钥存储 `ctx.secrets`                                     |
| `network`         | 受控网络 `ctx.net.fetch`（需 `manifest.network.hosts` 白名单） |
| `background`      | 后台定时任务 `ctx.jobs.every`（最小 5s）                       |
| `ui.composer`     | 向输入框插入文本 `ctx.composer.insert`                         |
| `ui.slot`         | 消息、输入区、会话头等插槽                                     |
| `ui.panel`        | 插件视图                                                       |
| `ui.statusbar`    | 状态栏条目                                                     |
| `ui.command`      | 命令                                                           |
| `ui.notification` | 系统通知与应用内消息                                          |
| `ui.skin`         | 全局背景皮肤                                                   |
| `ui.startup`      | 启动动画                                                       |
| `usage:read`      | 只读本地用量统计与历史                                         |
| `workspace:read`  | 只读当前会话工作区                                             |
| `events:<event>`  | 订阅指定事件                                                   |
| `events:*`        | 订阅全部公开事件                                               |

不申请不需要的权限。未声明能力会被宿主拒绝。

## 渲染进程 ctx

```ts
ctx.pluginId
ctx.commands.register(id, handler): Disposable
ctx.commands.registerProvider(id, provider): Disposable // 命令面板打开时收集动态条目
ctx.views.register(id, mount): Disposable
ctx.views.open(id): Promise<void>
ctx.slots.register(id, mount): Disposable
ctx.skins.register(id, mount): Disposable
ctx.startup.register(id, mount): Disposable
ctx.statusBar.add({ id, text, align?, title?, icon?, onClick? }): Disposable
ctx.events.on(event, (payload, meta) => void): Disposable
ctx.storage.get/set/delete
ctx.settings
ctx.logger.debug/info/warn/error
ctx.notifications.show(message, level?) // 系统通知
ctx.notifications.message(message, level?) // 应用内消息
ctx.workspace.readFile/list
ctx.usage.getStats(query): Promise<UsageStats>
ctx.net.fetch(url, { method, headers, body, timeoutMs })
ctx.secrets.get/set/delete
ctx.jobs.every(intervalMs, handler) // 最小 5s，停用自动清理
ctx.composer.insert(text) // 追加到当前输入框末尾
```

使用 `ctx.settings` 读取 manifest 声明的设置；使用 `ctx.storage` 持久化插件数据，不能写入插件目录作为数据存储。

## 启动动画

声明 `startup` 贡献点并申请 `ui.startup`。宿主在应用启动时提供全屏隔离容器，插件负责绘制动画；mount 的第三个参数是 `finish`，动画完成后必须调用它结束。宿主不设置固定结束时长，时长完全由插件控制；必须声明 `countdownMs`，仅用于跳过按钮展示剩余秒数。用户点击遮罩、按 Esc 或点击“跳过”按钮仍可结束。用户在外观设置里选择启动动画，选择持久化；没有选择时不显示遮罩。多个插件可以同时提供动画，但启动时只播放用户选中的一个；插件被禁用或删除后选择自动清除。启动动画必须使用 `--nh-*` 语义色，自动适配深浅主题；不要硬编码背景色或文字色。内置参考：`nexus.startup-intro`（淡入）、`nexus.startup-pulse`（脉冲）与 `nexus.startup-orbit`（轨道）。

```json
{
  "permissions": ["ui.startup"],
  "contributes": {
    "startup": [{ "id": "intro", "title": "启动动画", "countdownMs": 2600 }]
  }
}
```

```js
export function activate(ctx) {
  return ctx.startup.register('intro', (element, _ctx, finish) => {
    const label = document.createElement('div');
    label.textContent = 'Nexus';
    element.appendChild(label);
    const timer = setTimeout(finish, 1200);
    return () => {
      clearTimeout(timer);
      label.remove();
    };
  });
}
```

## 图片与二进制资源

- `generate_image` 和 `save_file` 输出到 `<userData>/files`，不能直接写入插件目录。
- 生成图片或输出文件后，在 `plugin_write.assets` 中提交：
  - `id`：插件 id
  - `fileId`：`generate_image` / `save_file` 返回的文件 id
  - `path`：必须以 `assets/` 开头，例如 `assets/icon.png`
- 只允许写入图片或字体资源（png/jpg/webp/gif/svg/ico/woff/woff2/ttf/otf），单文件 20MB 上限。
- `plugin_write` 一次审批覆盖 files、assets 与 delete；内置插件只读。

## 贡献点

- `views` / `messageSlots` / `statusBar` / `commands` / `settings` / `skins` / `startup` 见 manifest。
- `navigation`：`[{ id, title, viewId }]`，在侧栏显示入口并打开已声明的 `view`（需 `ui.panel`）。

## 常用插槽

| location                                                  | 用途          |
| --------------------------------------------------------- | ------------- |
| `sidebar.header` / `sidebar.footer`                       | 侧栏顶部/底部 |
| `statusbar.left` / `statusbar.right`                      | 状态栏左右    |
| `composer.toolbar` / `composer.above` / `composer.footer` | 输入区        |
| `empty-state`                                             | 空状态        |
| `session.header.actions`                                  | 会话头操作区  |
| `message.assistant.header` / `.footer` / `.actions`       | AI 消息       |
| `message.user.footer` / `.actions`                        | 用户消息      |
| `toolcall.body` / `toolcall.footer`                       | 工具调用卡片  |
| `terminal.toolbar`                                        | 终端工具条    |
| `filecard.actions` / `filecard.footer`                    | 文件卡片      |

插槽挂载在 Shadow DOM 中，插件只负责容器内部内容，不得改变宿主布局、遮挡宿主操作或劫持点击。

插槽上下文只读，包含 `location`、`sessionId`、`runId`、`messageId`、`role`、`usage` 等；AI 消息插槽额外提供 `durationMs`（本条消息的模型生成耗时，毫秒，不含工具执行与上下文准备）与 `contentChars`（正文字符数，Unicode 码点），可用于展示耗时与字数。错误气泡与子代理消息不提供这两项。

## 主进程 ctx

```ts
interface MainPluginContext {
  pluginId: string;
  storage: { get/set/delete };
  secrets: { get/set/delete };
  settings: Record<string, string | number | boolean | null>;
  logger: { debug/info/warn/error };
  notifications: { show };
  events: { on };
}
```

主进程入口不提供 DOM、插槽、视图或皮肤。启用第三方主进程插件等同于运行本地代码，必须告知用户来源与权限。

## 视图与用量

- `ctx.commands.registerProvider` 注册的快速选择项仅在插件**已激活**时出现在命令面板；需要配置相应的 `activationEvents`（如 `onSlot`/`onCommand`/`onEvent`）。

- 声明 `views` 贡献点并申请 `ui.panel`；`ctx.views.register` 挂载视图，`ctx.views.open(id)` 打开宿主大尺寸视图弹窗。视图的入口和展示位置由插件自行设计，宿主不自动列出。
- 需要分析数据时申请 `usage:read`，调用 `ctx.usage.getStats({ sessionId?, from?, to?, bucket? })`；返回总量（含 `cacheReadTokens` / `cacheWriteTokens` 提示缓存读写的可选字段，`inputTokens` 已含缓存读，缓存命中率可用 `cacheReadTokens / inputTokens` 估算）、时间序列、会话、模型和 Provider 分布，不需要读取数据库。按 `sessionId` 查询时额外返回可选 `context`（`contextWindow`、`maxOutputTokens`、`contextTokens`，取最近一次主对话调用的输入 token 近似当前上下文占用），用于展示上下文窗口占用；模型未解析时该字段缺省。
- 视图与命令可按需激活；视图打开失败应给出可诊断错误，不要静默失败。

## 事件

- 回调收到 `(payload, meta)`；`meta` 包含 `type`、`sessionId`、`runId`、`ts` 和可选 `parentToolCallId`，可用于按会话或时间刷新视图。
- `parentToolCallId` 表示子代理内部事件；做会话级统计或展示时应按它过滤，避免把子代理消息当成父会话消息重复统计。
- 高频 `message.delta` 默认不开放；使用 `message.completed`、`usage.recorded` 等聚合事件。
- session 生命周期事件会转发：`session.created`、`session.renamed`、`session.pinned`/`session.unpinned`、`session.model.changed`、`session.mode.changed`、`session.approvalPolicy.changed`、`scope.granted`/`scope.revoked`、`session.exported`、`session.removed`（删除会话会改变用量统计，可据此刷新）。
- 事件是只读观察，不能修改、拦截或替代审批。
- 订阅前必须在 manifest 声明 `events:<event>` 或 `events:*`。

## 本地开发与调试

1. 在用户工作区创建或修改插件源码；所有改动必须先让用户确认。
   - 不要尝试用 `read_file` / `write_file` 操作 `<userData>/plugins`，那会触发不必要的工作区授权。
   - 已安装用户插件使用 `plugin_read` 读取，使用 `plugin_write` 修改。
2. 执行项目已有构建命令，确保入口文件存在且路径正确。
3. 使用 `plugin_import` 导入本地构建目录，或使用 `plugin_write` 更新用户插件。
4. 使用 `plugin_reload` 刷新；检查 `plugin_list` 中的错误。
5. 启用插件后验证 UI 和行为；渲染插件使用 DevTools，主进程问题查看 `<userData>/logs`。
6. 修改后检查清理函数，避免重复注册、定时器泄漏和残留 DOM。

## 内置插件定制

1. 不修改内置插件目录或 `<userData>/plugins` 中的内置副本。
2. 使用 `plugin_write`：

```json
{
  "id": "your.scope.custom-theme",
  "fromPluginId": "nexus.skin-aurora"
}
```

3. 继续使用 `plugin_write` 修改新用户插件。
4. `plugin_reload` 后启用。
5. 原内置插件和应用更新不受影响。

## 验证清单

- [ ] `plugin.json` 可解析，id 与目录名一致。
- [ ] main/renderer 入口存在且路径在插件目录内。
- [ ] 权限与贡献点匹配，未申请不需要的能力；统计视图只申请 `usage:read` 和必要的 `ui.panel`。
- [ ] 所有 mount 和 activate 返回清理函数。
- [ ] 没有依赖宿主内部包、Node 全局或 `window.nexus`（renderer）。
- [ ] 无密钥、敏感路径和大段日志进入通知或 UI。
- [ ] `plugin_reload` 后无错误，启用/停用行为正确。
- [ ] 卸载或停用后没有残留监听器、定时器和 DOM。
- [ ] 用户明确知道插件来源、权限和启用后的影响。

## 最小示例

`plugin.json`：

```json
{
  "id": "your.scope.hello",
  "name": "Hello",
  "version": "1.0.0",
  "engines": { "nexus": ">=0.0.1 <0.1.0" },
  "renderer": "dist/renderer.mjs",
  "activationEvents": ["onSlot:hello.footer"],
  "permissions": ["ui.slot"],
  "contributes": {
    "messageSlots": [{ "id": "hello.footer", "location": "message.assistant.footer" }]
  }
}
```

`dist/renderer.mjs`：

```js
export function activate(ctx) {
  return ctx.slots.register('hello.footer', (element, context) => {
    const span = document.createElement('span');
    const parts = [];
    if (context.usage) {
      parts.push(`本次 ${context.usage.inputTokens + context.usage.outputTokens} tokens`);
    }
    if (typeof context.durationMs === 'number') {
      parts.push(`${(context.durationMs / 1000).toFixed(1)}s`);
    }
    if (typeof context.contentChars === 'number') {
      parts.push(`${context.contentChars} 字`);
    }
    span.textContent = parts.join(' · ') || 'Hello';
    span.style.cssText =
      'display:block;margin-top:6px;color:var(--nh-color-text-secondary);font-size:11px';
    element.appendChild(span);
    return () => span.remove();
  });
}
```
