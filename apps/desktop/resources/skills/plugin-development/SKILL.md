---
name: plugin-development
description: 当用户要创建、修改、调试或发布 Nexus 插件时使用；覆盖本地插件项目、用户插件、内置插件复制、manifest、renderer/main 入口、权限、插槽、事件与验证流程。
metadata:
  tags: [插件开发, plugin, manifest, renderer, main, slots, permissions, 用户插件]
  version: 1.0.0
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
- 不开放 `workspace:write`、插件注册工具和网络权限；未声明的能力会被宿主拒绝。
- 内置插件只读，不能直接修改；用户插件才可以修改。需要定制内置插件时，先复制成新的用户插件。

## 工作流程

1. **确认目标**：插件要解决什么问题、面向哪个界面、是否需要主进程逻辑。
2. **定位项目**：确认插件源码目录、构建命令和现有文件；不要假设用户没有项目。
3. **读取现状**：至少检查 `plugin.json`、入口文件、`package.json`、现有贡献点和权限。
4. **设计 manifest**：先确定 id、入口、activationEvents、permissions 与 contributes。
5. **实现入口**：渲染入口优先保持轻量；耗时操作按需激活，不在 `activate` 中做重初始化。
6. **本地构建**：使用项目已有构建命令；产物必须输出到 manifest 声明的入口路径。
7. **导入/更新**：
   - 从本地目录导入：`plugin_import`，传绝对 `sourceDir`。
   - 直接在用户插件目录开发：`plugin_create` 或 `plugin_update`。
   - 删除用户插件：`plugin_delete`；内置插件只能停用。
   - 内置插件定制：`plugin_create` 使用 `fromPluginId` 复制为新的用户插件 id，再 `plugin_update`。
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
  "engines": { "nexus": "^0.1.0" },
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
- 视图/命令贡献：扩展页打开或用户启用插件时。
- 皮肤贡献：用户选择该皮肤时。

## 权限

| 权限              | 能力                       |
| ----------------- | -------------------------- |
| `storage`         | 隔离的 `ctx.storage`       |
| `ui.slot`         | 消息、输入区、会话头等插槽 |
| `ui.panel`        | 插件视图                   |
| `ui.statusbar`    | 状态栏条目                 |
| `ui.command`      | 命令                       |
| `ui.notification` | 应用内/系统通知            |
| `ui.skin`         | 全局背景皮肤               |
| `workspace:read`  | 只读当前会话工作区         |
| `events:<event>`  | 订阅指定事件               |
| `events:*`        | 订阅全部公开事件           |

不申请不需要的权限。未声明能力会被宿主拒绝。

## 渲染进程 ctx

```ts
ctx.pluginId
ctx.commands.register(id, handler): Disposable
ctx.views.register(id, mount): Disposable
ctx.slots.register(id, mount): Disposable
ctx.skins.register(id, mount): Disposable
ctx.statusBar.add(item): Disposable
ctx.events.on(event, handler): Disposable
ctx.storage.get/set/delete
ctx.settings
ctx.logger.debug/info/warn/error
ctx.notifications.show
ctx.workspace.readFile/list
```

使用 `ctx.settings` 读取 manifest 声明的设置；使用 `ctx.storage` 持久化插件数据，不能写入插件目录作为数据存储。

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

## 主进程 ctx

```ts
interface MainPluginContext {
  pluginId: string;
  storage: { get/set/delete };
  settings: Record<string, string | number | boolean | null>;
  logger: { debug/info/warn/error };
  notifications: { show };
  events: { on };
}
```

主进程入口不提供 DOM、插槽、视图或皮肤。启用第三方主进程插件等同于运行本地代码，必须告知用户来源与权限。

## 事件

- 回调只收到 payload，不包含事件信封；需要 sessionId/runId 时优先使用 SlotContext。
- 高频 `message.delta` 默认不开放；使用 `message.completed`、`usage.recorded` 等聚合事件。
- 事件是只读观察，不能修改、拦截或替代审批。
- 订阅前必须在 manifest 声明 `events:<event>` 或 `events:*`。

## 本地开发与调试

1. 在用户工作区创建或修改插件源码；所有改动必须先让用户确认。
   - 不要尝试用 `read_file` / `write_file` 操作 `<userData>/plugins`，那会触发不必要的工作区授权。
   - 已安装用户插件使用 `plugin_read` 读取，使用 `plugin_create` / `plugin_update` 修改。
2. 执行项目已有构建命令，确保入口文件存在且路径正确。
3. 使用 `plugin_import` 导入本地构建目录，或使用 `plugin_update` 更新用户插件。
4. 使用 `plugin_reload` 刷新；检查 `plugin_list` 中的错误。
5. 启用插件后验证 UI 和行为；渲染插件使用 DevTools，主进程问题查看 `<userData>/logs`。
6. 修改后检查清理函数，避免重复注册、定时器泄漏和残留 DOM。

## 内置插件定制

1. 不修改内置插件目录或 `<userData>/plugins` 中的内置副本。
2. 使用 `plugin_create`：

```json
{
  "id": "your.scope.custom-theme",
  "fromPluginId": "nexus.skin-aurora"
}
```

3. 使用 `plugin_update` 修改新用户插件。
4. `plugin_reload` 后启用。
5. 原内置插件和应用更新不受影响。

## 验证清单

- [ ] `plugin.json` 可解析，id 与目录名一致。
- [ ] main/renderer 入口存在且路径在插件目录内。
- [ ] 权限与贡献点匹配，未申请不需要的能力。
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
  "engines": { "nexus": "^0.1.0" },
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
