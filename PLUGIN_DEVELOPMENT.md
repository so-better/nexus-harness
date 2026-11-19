# Nexus 插件开发指南

本文档面向插件作者，说明插件目录、manifest、运行时 API、可用插槽和可订阅事件。宿主内部实现见 `AGENTS.md`。

## 1. 插件类型

Nexus 支持两种入口：

| 入口       | 文件                | 运行位置 | 适合场景                                   |
| ---------- | ------------------- | -------- | ------------------------------------------ |
| `renderer` | `dist/renderer.mjs` | 渲染进程 | 状态栏、消息插槽、视图、设置界面、全局皮肤 |
| `main`     | `dist/main.cjs`     | 主进程   | 后台逻辑、事件监听、持久化任务             |

`renderer` 入口不能访问 Node、Electron 或 `window.nexus`。`main` 入口等同于受信本地代码，拥有主进程能力；扩展页会把它标记为“主进程代码”，只有用户明确启用后才会加载。

## 2. 插件目录

插件放在：

```text
<userData>/plugins/<plugin-id>/
├─ plugin.json
├─ dist/
│  ├─ renderer.mjs       # 可选，ESM
│  └─ main.cjs           # 可选，CommonJS
└─ assets/               # 可选，插件自己的资源
```

`<userData>` 是应用数据目录。用户也可以从扩展页“导入插件”选择一个包含 `plugin.json` 的目录。导入后插件默认禁用，在扩展页确认权限并启用后才会激活。

仓库内置参考实现：

- `apps/desktop/resources/plugins/nexus.token-usage`
- `apps/desktop/resources/plugins/nexus.theme-background`

内置插件启动时会同步到 `<userData>/plugins`，加载流程与用户插件相同。

## 3. manifest

最小 manifest：

```json
{
  "id": "your.scope.plugin",
  "name": "示例插件",
  "version": "1.0.0",
  "description": "做什么，以及用户为什么会启用它。",
  "engines": { "nexus": "^0.1.0" },
  "renderer": "dist/renderer.mjs",
  "activationEvents": ["onSlot:example.footer"],
  "permissions": ["ui.slot"],
  "contributes": {
    "messageSlots": [
      {
        "id": "example.footer",
        "location": "message.assistant.footer"
      }
    ]
  }
}
```

| 字段               | 说明                                                 |
| ------------------ | ---------------------------------------------------- |
| `id`               | 反向域名，必须与目录名一致，例如 `your.scope.plugin` |
| `name`             | 显示名称                                             |
| `version`          | semver 字符串                                        |
| `description`      | 扩展页中的说明                                       |
| `engines.nexus`    | 目标宿主版本范围                                     |
| `main`             | 可选，主进程入口，相对插件目录的 CommonJS 文件       |
| `renderer`         | 可选，渲染入口，相对插件目录的 ESM 文件              |
| `activationEvents` | 按需激活标记，见下文                                 |
| `permissions`      | 权限声明，见第 5 节                                  |
| `contributes`      | 贡献点声明，见第 6 节                                |

入口路径必须位于插件目录内。渲染入口由宿主的 `nexus-plugin://` 协议加载；主进程入口由主进程加载。插件依赖必须自行打包进插件目录，不能依赖 `@nexus/*` 或应用安装目录中的模块。

## 4. 入口函数

两个入口都导出：

```js
export function activate(ctx) {
  return () => {
    // 可选清理逻辑
  };
}

export function deactivate() {
  // 可选清理逻辑
}
```

`activate(ctx)` 可以返回清理函数，也可以使用 `deactivate()`。插件停用、禁用、热重载或卸载时，宿主会调用清理逻辑。渲染进程入口激活超时为 10 秒；激活失败会自动禁用插件并在扩展页显示错误。

### 激活时机

`activationEvents` 用于声明意图，当前运行时会在以下时机激活插件：

- `onSlot:<slotId>`：插槽首次渲染时。
- `onEvent:<eventName>`：对应领域事件到来时。
- 状态栏贡献：状态栏首次渲染时。
- 视图/命令贡献：扩展页打开或用户启用插件时。
- 皮肤贡献：用户在“设置 → 外观 → 皮肤”选择该皮肤时。

插件不需要在 `activate` 中执行耗时初始化；重活放到用户真正打开对应界面时再做。

## 5. 权限

```json
"permissions": ["storage", "events:usage.recorded", "ui.slot"]
```

| 权限              | 能力                                           |
| ----------------- | ---------------------------------------------- |
| `storage`         | 使用按插件隔离的 `ctx.storage`                 |
| `ui.slot`         | 注册消息/输入区/会话头等插槽                   |
| `ui.panel`        | 注册视图                                       |
| `ui.statusbar`    | 注册状态栏条目                                 |
| `ui.command`      | 注册命令                                       |
| `ui.notification` | 发送应用内/系统通知                            |
| `ui.skin`         | 注册全局背景皮肤                               |
| `workspace:read`  | 只读访问当前会话工作区                         |
| `events:<event>`  | 订阅指定领域事件，例如 `events:usage.recorded` |
| `events:*`        | 订阅全部公开事件                               |

当前不开放 `workspace:write`、插件注册工具和网络权限。未声明的能力调用会被宿主拒绝；渲染进程插件无法通过 `window.nexus` 绕过权限。

## 6. 贡献点

### 6.1 插槽 `messageSlots`

```json
"contributes": {
  "messageSlots": [
    { "id": "example.footer", "location": "message.assistant.footer" }
  ]
}
```

`id` 在同一插件、同一 `location` 内必须唯一；不同插件可以使用相同 id。多个插件使用同一个 `location` 时，宿主按插件激活/注册顺序把内容追加到插槽；每个插件在独立 Shadow DOM 中渲染，默认是块级纵向排列，没有自动间距、排序或分隔线。

当前已挂载到界面的插槽：

| location                               | 位置                           | SlotContext 额外数据                                          |
| -------------------------------------- | ------------------------------ | ------------------------------------------------------------- |
| `sidebar.header`                       | 侧栏标题区右侧                 | `sessionId`                                                   |
| `sidebar.footer`                       | 侧栏底部                       | `sessionId`                                                   |
| `session.item.actions`                 | 会话列表项操作区               | `sessionId`                                                   |
| `statusbar.left` / `statusbar.right`   | 底部状态栏左右区域             | `sessionId`                                                   |
| `composer.toolbar`                     | 输入区工具条                   | `sessionId`、`usage`                                          |
| `composer.above`                       | 输入框上方                     | `sessionId`、`usage`                                          |
| `composer.footer`                      | 输入框下方、发送操作上方       | `sessionId`、`usage`                                          |
| `empty-state`                          | 无会话/无消息空状态            | `sessionId`                                                   |
| `session.header.actions`               | 会话标题栏右侧，与导出按钮并排 | `sessionId`、`usage`                                          |
| `message.assistant.header`             | AI 消息头部                    | `sessionId`、`messageId`、`runId`、`role`、`usage`            |
| `message.assistant.footer`             | AI 消息底部                    | `sessionId`、`messageId`、`runId`、`role`、`usage`            |
| `message.assistant.actions`            | AI 消息操作区                  | `sessionId`、`messageId`、`runId`、`role`、`usage`            |
| `message.user.footer`                  | 用户消息底部                   | `sessionId`、`messageId`、`runId`、`role`                     |
| `message.user.actions`                 | 用户消息操作区                 | `sessionId`、`messageId`、`runId`、`role`                     |
| `toolcall.body`                        | 工具调用卡片内容区             | `sessionId`、`messageId`、`runId`、`toolCallId`               |
| `toolcall.footer`                      | 工具调用卡片底部               | `sessionId`、`messageId`、`runId`、`toolCallId`               |
| `terminal.toolbar`                     | 终端搜索与关闭图标之间         | `sessionId`                                                   |
| `filecard.actions` / `filecard.footer` | 输出文件卡片操作区/底部        | `sessionId`、`runId`、`fileId`                                |

`statusbar.left/right` 是插槽；如果只需要一个状态栏文本入口，优先使用 `statusBar` 贡献点。

`SlotContext`：

```ts
interface SlotContext {
  location: string;
  sessionId?: string;
  runId?: string;
  messageId?: string;
  role?: 'user' | 'assistant';
  toolCallId?: string;
  approvalId?: string;
  fileId?: string;
  usage?: { inputTokens: number; outputTokens: number; cost?: number };
  model?: string;
}
```

`usage` 是宿主只读投影：`session.header.actions` 和 `composer.footer` 是会话累计用量，`message.assistant.footer` 是该 Run 的消息用量。插件应直接读取它，不要自行跨会话累计。

每个 `mount` 必须返回清理函数：

```js
export function activate(ctx) {
  return ctx.slots.register('example.footer', (element, context) => {
    const span = document.createElement('span');
    span.textContent = context.usage
      ? `${context.usage.inputTokens + context.usage.outputTokens} tokens`
      : '';
    element.appendChild(span);
    return () => span.remove();
  });
}
```

### 6.2 状态栏 `statusBar`

```json
"permissions": ["ui.statusbar"],
"contributes": {
  "statusBar": [{ "id": "example.status", "align": "right" }]
}
```

```js
export function activate(ctx) {
  return ctx.statusBar.add({
    id: 'example.status',
    text: 'Ready',
    title: '示例状态',
    align: 'right',
    onClick: () => ctx.notifications.show('Hello')
  });
}
```

状态栏条目是普通文本/按钮式入口，不进入插槽布局。

### 6.3 命令 `commands`

```json
"permissions": ["ui.command"],
"contributes": {
  "commands": [{ "id": "example.run", "title": "运行示例", "shortcut": "CmdOrCtrl+Shift+E" }]
}
```

```js
export function activate(ctx) {
  return ctx.commands.register('example.run', () => {
    ctx.notifications.show('命令已执行');
  });
}
```

命令从扩展页的命令列表触发。`shortcut` 当前作为展示元数据保存，快捷键绑定仍以宿主命令注册表为准。

### 6.4 视图 `views`

```json
"permissions": ["ui.panel"],
"contributes": {
  "views": [{ "id": "example.panel", "title": "示例面板", "location": "main" }]
}
```

```js
export function activate(ctx) {
  return ctx.views.register('example.panel', (element) => {
    element.textContent = '插件视图';
    return () => {
      element.textContent = '';
    };
  });
}
```

当前视图从扩展页打开；`location` 是元数据，宿主不会自动把视图放进侧栏或主区。

### 6.5 全局皮肤 `skins`

```json
"permissions": ["ui.skin"],
"contributes": {
  "skins": [{ "id": "mist", "title": "晨雾" }]
}
```

```js
export function activate(ctx) {
  return ctx.skins.register('mist', (element) => {
    const canvas = document.createElement('canvas');
    element.appendChild(canvas);
    return () => canvas.remove();
  });
}
```

皮肤由插件代码绘制，可使用图片、canvas、WebGL 或 DOM；宿主只提供固定的隔离背景层，不注入全局 CSS。用户需要在“设置 → 外观 → 皮肤”选择后才显示。插件停用或切换皮肤时必须清理动画、监听器和 DOM。

### 6.6 设置 `settings`

```json
"contributes": {
  "settings": [
    { "key": "mode", "type": "string", "default": "safe", "title": "模式" },
    { "key": "limit", "type": "number", "default": 5, "title": "上限" },
    { "key": "enabled", "type": "boolean", "default": true, "title": "开关" }
  ]
}
```

扩展页会按声明生成设置表单，保存后重载插件。插件激活时通过 `ctx.settings` 读取当前值：

```js
const mode = ctx.settings.mode ?? 'safe';
```

设置值只允许 `string | number | boolean | null`。未声明的键无法通过宿主设置接口写入。

## 7. 渲染进程 API

`ctx` 的完整类型见 `packages/shared/src/plugin-api.d.ts`，开发时可复制该文件到插件项目获得类型提示，不需要安装额外 npm 包。

```ts
ctx.pluginId: string;
ctx.commands.register(id, handler): Disposable;
ctx.views.register(id, mount): Disposable;
ctx.slots.register(id, mount): Disposable;
ctx.skins.register(id, mount): Disposable;
ctx.statusBar.add(item): Disposable;
ctx.events.on(event, handler): Disposable;
ctx.storage.get<T>(key): Promise<T | undefined>;
ctx.storage.set<T>(key, value): Promise<void>;
ctx.storage.delete(key): Promise<void>;
ctx.settings: Record<string, string | number | boolean | null>;
ctx.logger.debug/info/warn/error(message): void;
ctx.notifications.show(message, level?): void;
ctx.workspace.readFile(path): Promise<string>;
ctx.workspace.list(dir?): Promise<PluginWorkspaceEntry[]>;
```

### 7.1 `ctx.events`

```js
const dispose = ctx.events.on('usage.recorded', (payload) => {
  console.log(payload.inputTokens, payload.outputTokens, payload.cost);
});
```

需要 manifest 中声明：

```json
"permissions": ["events:usage.recorded"]
```

事件回调当前只接收 payload，不包含事件信封；需要 `sessionId`/`runId` 时优先使用插槽 `SlotContext`。高频事件 `message.delta` 默认不开放。`events:*` 可订阅公开事件，但不应用于修改或拦截事件。

### 7.2 `ctx.storage`

```js
const count = (await ctx.storage.get('count')) ?? 0;
await ctx.storage.set('count', count + 1);
await ctx.storage.delete('count');
```

存储按插件 id 隔离，不能读写其他插件的数据。插件目录不是写入位置；需要持久化时统一使用 storage。

### 7.3 `ctx.workspace`

需要 `workspace:read`，且当前必须有活动会话工作区：

```js
if (ctx.pluginId) {
  const entries = await ctx.workspace.list('.');
  const text = await ctx.workspace.readFile('README.md');
}
```

`readFile`/`list` 只能访问当前会话 RootGrant 允许的目录；路径越界、敏感路径、无工作区都会失败。`readFile` 当前读取 UTF-8 文本，单文件上限 1 MB；插件没有工作区写权限。

### 7.4 通知

```js
ctx.notifications.show('任务完成', 'info');
```

需要 `ui.notification` 权限。不要在通知中放密钥、敏感路径或大段模型输出。

## 8. 主进程 API

主进程入口使用 `ctx`：

```ts
interface MainPluginContext {
  pluginId: string;
  storage: {
    get<T>(key: string): T | undefined;
    set<T>(key: string, value: T): void;
    delete(key: string): void;
  };
  settings: Record<string, PluginSettingValue>;
  logger: {
    debug/info/warn/error(message: string): void;
  };
  notifications: {
    show(message: string, level?: 'info' | 'warning' | 'error'): void;
  };
  events: {
    on(event: string, handler: (payload: unknown) => void): () => void;
  };
}
```

主进程入口适合后台事件处理，不提供 DOM、插槽、视图或皮肤能力。需要 `storage` 才能使用 `ctx.storage`，需要 `ui.notification` 才能使用通知，订阅事件同样需要 `events:<event>` 权限。

主进程插件属于受信代码边界：启用第三方主进程插件等同于允许它运行本地代码。只安装来源可信的插件；扩展页会显示“主进程代码”标记。主进程激活超时后会禁用插件并清理已注册资源，但无法强制终止插件内部已经启动的异步任务。

## 9. 可订阅事件

事件回调收到的是 payload；事件本身的 `id`、`sessionId`、`runId`、`seq`、`ts` 不包含在 payload 中。

| 事件                                  | 主要字段                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `session.created`                     | `workspaceId?`、`title?`                                                 |
| `session.mode.changed`                | `mode`                                                                   |
| `session.model.changed`               | `providerId`、`modelId`                                                  |
| `session.renamed`                     | `title`、`source`                                                        |
| `session.pinned` / `session.unpinned` | 无                                                                       |
| `session.removed`                     | 无                                                                       |
| `session.exported`                    | `sessionId`、`format`、`fileId?`、`path?`                                |
| `scope.granted`                       | `path`、`kind`、`access`、`source`                                       |
| `scope.revoked`                       | `path`                                                                   |
| `run.started`                         | `model`                                                                  |
| `run.completed`                       | `durationMs`                                                             |
| `run.failed`                          | `error.code`、`error.message`                                            |
| `run.cancelled`                       | `reason?`                                                                |
| `run.interrupted`                     | `reason`                                                                 |
| `message.completed`                   | `messageId`、`role`、`content`、`images?`、`references?`                 |
| `message.edited`                      | `messageId`、`content`、`references?`                                    |
| `message.regenerated`                 | `messageId`、`sourceMessageId`                                           |
| `message.superseded`                  | `messageId`、`reason`                                                    |
| `tool.requested`                      | `toolCallId`、`name`、`input`                                            |
| `tool.completed`                      | `toolCallId`、`ok`、`output?`、`artifactId?`、`bytes?`                   |
| `tool.failed`                         | `toolCallId`、`error.code`、`error.message`                              |
| `checkpoint.created`                  | `checkpointId`、`label`、`path?`、`existed?`、`toolCallId?`              |
| `checkpoint.restored`                 | `checkpointId`                                                           |
| `ask_user.requested`                  | `requestId`、`questions`                                                 |
| `ask_user.resolved`                   | `requestId`、`answers`、`cancelled`                                      |
| `approval.requested`                  | `approvalId`、`toolCallId`、`scope`                                      |
| `approval.resolved`                   | `approvalId`、`decision`、`reason?`                                      |
| `terminal.opened`                     | `terminalId`、`sessionId`、`cwd`、`pid`、`shell`                         |
| `terminal.closed`                     | `terminalId`、`sessionId`                                                |
| `terminal.started`                    | `terminalId`、`command`、`cwd`、`pid`                                    |
| `usage.recorded`                      | `provider`、`model`、`inputTokens`、`outputTokens`、`cost?`              |
| `file.created`                        | `fileId`、`name`、`mime`、`bytes`、`source`                              |
| `context.compacted`                   | `beforeTokens`、`afterTokens`、`strategy`、`summaryRef?`、`artifactIds?` |
| `settings.updated`                    | `key`、`scope`                                                           |

`message.delta` 是流式高频事件，运行时默认拒绝订阅；订阅 `message.completed` 或 `usage.recorded` 等聚合事件。事件是只读观察，不能修改、拦截或替代审批。

## 10. 调试与发布

1. 新建 `plugin.json` 和 `dist/renderer.mjs`；依赖自行打包。
2. 将目录放到 `<userData>/plugins/<id>`，或通过扩展页导入。
3. 在扩展页启用插件并确认权限；修改目录后宿主会热重载。
4. 渲染进程插件用 DevTools 调试；主进程日志写入 `<userData>/logs`。
5. 错误会显示在扩展页；渲染插件激活失败会被自动禁用，修复后可重新启用。
6. 分发时压缩整个插件目录，用户解压到 `<userData>/plugins` 或从扩展页导入即可。

## 11. 最小完整示例

```json
{
  "id": "your.scope.hello",
  "name": "Hello",
  "version": "1.0.0",
  "engines": { "nexus": "^0.1.0" },
  "renderer": "dist/renderer.mjs",
  "activationEvents": ["onSlot:hello.footer"],
  "permissions": ["ui.slot"],
  "contributes": {
    "messageSlots": [{ "id": "hello.footer", "location": "message.assistant.footer" }]
  }
}
```

```js
export function activate(ctx) {
  return ctx.slots.register('hello.footer', (element, context) => {
    const span = document.createElement('span');
    span.textContent = context.usage
      ? `本次 ${context.usage.inputTokens + context.usage.outputTokens} tokens`
      : 'Hello';
    span.style.cssText =
      'display:block;margin-top:6px;color:var(--nh-color-text-secondary);font-size:11px';
    element.appendChild(span);
    return () => span.remove();
  });
}
```
