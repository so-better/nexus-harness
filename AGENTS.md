# Nexus Harness 开发规范

本文件是本仓库的**唯一强制性开发规范**。所有人（包括 AI 协作方）在新增、修改、重构代码前必须先阅读并遵守。规范与临时便利冲突时，以本文件为准；确需例外时，必须在代码评审中说明理由，并同步更新本文件。

### 文档维护约定

本文件是**活文档**，随项目演进而持续调整；第 3 节的目录结构是当前基线，不是永久约束。允许根据实际需求重组目录、拆分或合并模块，但必须满足以下条件：

- 调整前说明动机与影响范围，避免为了短期便利破坏分层原则。
- 结构性变更与规范变更必须在同一次提交中同步更新本文件。
- 若新结构与本文冲突，以更新后的本文为准，不得只改代码不改文档。
- 产品定位、能力分层、设计原则等讨论结论也应沉淀到本文件；内容过多时可拆分到 `docs/`，但本文件必须保留索引与结论。
- 定期回顾本文件，删除已失效的约定，保持与实际代码一致。

---

## 1. 项目定位与核心原则

### 1.1 产品定位

Nexus Harness 是一个**多 Agent 的综合 harness 框架应用**：不是单个 chatbot，也不是只服务某一种任务的工具，而是让多个 Agent 在统一运行时内可靠完成真实任务的工作台。

产品采用“底层通用、方向外置”的策略：核心只提供与领域无关的 agent 运行时与多 Agent 编排，具体方向通过工具、技能与插件扩展。首阶段以代码场景作为验证闭环（能读代码、能改、能运行、能自测），但 `core` 不得假设“代码”这一领域；后续可通过 skills / tools / plugins 扩展为研究、文档、创作等通用工作台。

**Agent 与 Harness 的区别**：Agent 是模型驱动的执行者，负责“思考 → 调工具 → 观察 → 继续”；Harness 是承载与约束 Agent 的运行时，负责上下文、工具执行、权限审批、事件流、检查点回滚、多 Agent 调度与 UI。Agent 是能力，Harness 是让能力变成稳定产出的工程体系。

产品描述：

> Nexus Harness 是一个面向真实任务的 AI Agent 工作台。多个 Agent 可以拆分任务、并行协作、共享工作区；所有工具调用、审批、变更与费用都可审计、可回滚。能力通过工具、技能与插件持续扩展。

电梯陈述：

> 我们不只做一个 Agent，而是造一个让多个 Agent 可靠工作的环境。

体验目标：对齐 Apple 的设计与交互水准，macOS 优先，Windows 兼容。

定位禁区：不使用“全能 AI 助手”“聊天 + 工具”“自动化一切”等模糊或过度承诺的表述。

### 1.2 核心原则

核心原则，按优先级排序：

1. **可维护性优先**：结构清晰、职责单一、命名自解释，宁可多拆文件，不做“能跑就行”的实现。
2. **边界清晰**：进程边界、模块边界、插件边界必须显式，跨边界只通过契约通信。
3. **体验优先**：遵循 Apple 的清晰、克制、深度三原则；键盘优先、直接操作、渐进披露，动效服务于理解而非装饰。
4. **方向外置**：核心不硬编码领域能力；任何行业或场景能力只能通过 tool / skill / plugin 进入。
5. **多 Agent 原生**：任务拆分、并行执行、独立上下文与统一审计是核心能力；编排层不得耦合单一 UI 或单一模型提供商。
6. **默认安全**：渲染进程不接触 Node；插件能力由权限清单控制；危险操作必须经过审批。
7. **主题先行**：所有颜色、间距、圆角、阴影、动效来自语义 token，天然支持深浅色与插件扩展。
8. **可测试**：核心逻辑与 Electron、Vue 解耦，能在 Node 环境中独立测试。

---

## 2. 技术栈与版本

| 类别 | 选型 | 主版本 |
| --- | --- | --- |
| 运行时 | Node.js | 24.x |
| 包管理 | pnpm workspace | 10.x |
| 桌面壳 | Electron | 45.x |
| 构建 | electron-vite | 6.x |
| 前端框架 | Vue | 3.5.x |
| 语言 | TypeScript | 7.x |
| 样式 | Less | 4.x |
| 组件库 | Naive UI | 2.45.x |
| 状态 | Pinia | 4.x |
| 路由 | vue-router | 5.x |
| 契约校验 | zod | 4.x |
| 打包 | electron-builder | 26.x |
| 代码编辑器 | Monaco Editor | 0.57.x |
| 终端 | @xterm/xterm | 6.x |
| Markdown | markdown-it + shiki | 15.x / 4.x |
| 测试 | Vitest | 5.x |
| 质量 | ESLint / Prettier / stylelint | 10.x / 3.x / 18.x |

版本以 `package.json` 为准；升级主版本必须单独提交并说明影响范围。

---

## 3. 仓库结构

以下结构是当前基线，可按“文档维护约定”演进，调整时必须同步更新本文件。

```text
nexus-harness/
├─ AGENTS.md                     # 本规范
├─ package.json                  # workspace 根脚本与统一依赖版本
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ apps/
│  └─ desktop/
│     ├─ electron.vite.config.ts
│     └─ src/
│        ├─ main/                # Electron 主进程
│        │  ├─ app/              # 生命周期、窗口、菜单、托盘、单实例
│        │  ├─ ipc/              # 按域拆分的 IPC handler
│        │  ├─ services/
│        │  │  ├─ agent/         # 会话循环、上下文、检查点
│        │  │  ├─ provider/      # 模型提供商适配器管理
│        │  │  ├─ tool/          # 工具执行与审批
│        │  │  ├─ plugin-host/   # 插件发现、加载、权限、事件分发
│        │  │  ├─ storage/       # 持久化（会话、设置、工作区索引）
│        │  │  └─ secret/        # safeStorage 密钥读写
│        │  └─ security/         # 沙箱、路径白名单、命令拦截
│        ├─ preload/             # contextBridge 唯一入口
│        └─ renderer/
│           ├─ app/              # 启动、全局 provider、路由
│           ├─ layouts/          # 主布局、侧栏、面板容器
│           ├─ modules/          # 功能模块（见 3.2）
│           ├─ components/       # 跨模块通用原子组件
│           ├─ plugin-runtime/   # 插件宿主、贡献点渲染、权限提示
│           ├─ composables/      # 跨模块通用逻辑
│           ├─ stores/           # 仅全局 store（theme / app / layout）
│           ├─ platform/         # macOS / Windows 平台差异适配
│           ├─ styles/           # tokens、主题、mixins
│           └─ types/            # 全局类型声明
├─ packages/
│  ├─ shared/                    # zod 契约、跨端类型、常量、IPC 通道
│  ├─ core/                      # agent 循环、事件流、工具注册表、权限模型
│  ├─ providers/                 # 统一 LLM 抽象（纯 TS，不依赖 Electron/Vue）
│  ├─ tools/                     # fs / shell / grep / fetch / MCP
│  ├─ orchestrator/              # 任务拆分、DAG、并行子 Agent
│  └─ plugin-sdk/                # 插件唯一依赖，暴露 ctx 类型与 definePlugin
├─ plugins/
│  └─ token-usage/               # 内置示例插件，插件开发样板
└─ skills/
   └─ <skill-id>/                # 内置技能包：SKILL.md + 资源 + 可选脚本
```

### 3.1 分层与依赖方向

```text
renderer ──> shared
preload  ──> shared
main     ──> shared + packages
packages ──> shared（packages 之间允许，但禁止反向依赖 apps）
```

- `packages/core`、`packages/providers`、`packages/tools`、`packages/orchestrator` **禁止**依赖 Electron、Vue、DOM。
- 渲染层**禁止**直接 import `electron`、`node:*`、`fs` 等模块。
- 跨进程数据必须定义在 `packages/shared`，并用 zod 校验。
- 插件只能依赖 `@nexus/plugin-sdk`，不得直接依赖内部包。

### 3.2 功能模块内部结构

`renderer/modules/<module>/` 固定结构，按需创建子目录，不用的目录不建：

```text
modules/chat/
├─ views/               # 页面级编排组件，只做组合与布局
├─ components/          # 该模块专属展示组件
├─ composables/         # 该模块逻辑复用，use 前缀
├─ stores/              # 该模块 Pinia store
├─ api/                 # 对 window.nexus 的封装，禁止在组件里直接调用
├─ types.ts             # 模块内类型
└─ index.ts             # 模块对外导出，避免外部深路径引用
```

模块之间**禁止**直接引用对方 `components/`、`stores/`、`api/`；需要共享时抽到 `components/`、`composables/`、`packages/shared`。

### 3.3 能力分层

产品能力分为三层，职责不可混用：

- **Tool（工具）**：原子、可审批的动作单元，输入输出由 zod 定义，在主进程执行，如读写文件、执行命令、网络请求、MCP 调用。工具回答“能做什么”。
- **Skill（技能）**：声明式任务包，包含说明、资源与可选脚本，告诉 Agent“某类任务该怎么做”。技能不直接获得进程权限，只能通过工具行动。
- **Plugin（插件）**：运行时扩展，通过贡献点添加 UI、命令、事件订阅与设置，也可注册工具。插件负责“集成与产品化扩展”。

约束：

- 领域方向只能通过 tool / skill / plugin 进入；`packages/core` 与 `packages/orchestrator` 禁止出现针对具体行业或场景的硬编码分支。
- 新能力优先实现为 skill 或 tool；只有需要 UI、事件订阅或第三方集成时才做 plugin。
- 内置技能位于仓库根 `skills/<id>`，固定结构：

```text
skills/<skill-id>/
├─ SKILL.md             # 触发条件、步骤、约束与验收标准
├─ assets/              # 模板、参考文件（可选）
└─ scripts/             # 可选脚本，执行前必须经过工具审批
```

- V1 只加载内置技能；外部技能安装能力后续再设计。

### 3.4 会话事件模型

- 会话以 append-only 事件流持久化，至少包含：`session.created`、`message.delta`、`message.completed`、`tool.requested`、`tool.completed`、`approval.requested`、`approval.resolved`、`checkpoint.created`、`usage.recorded`、`session.completed`。
- UI 只渲染事件流的投影状态，不持有业务真相；应用重启或崩溃后可从事件流恢复。
- 任何会改变工作区或产生费用的动作，必须先记录 `tool.requested` 或审批事件再执行，保证可审计、可回放、可回滚。
- 插件通过宿主事件总线订阅，payload 由 `packages/shared` 定义并校验，宿主按权限过滤。

---

## 4. 组件拆分规范

### 4.1 拆分标准

- 一个文件只放一个组件，文件名与组件名一致，使用 PascalCase。
- 满足任意一条即必须拆分：
  - 单文件超过 **200 行**（不含模板中的简单标记）。
  - 同时承担 **3 个及以上职责**（数据获取、状态管理、展示、交互编排等）。
  - 出现可被第二个页面复用的 UI 或逻辑。
  - props 或 emits 超过 **6 个**，应改为组合子组件或使用插槽。
- 可复用逻辑必须提取到 `composables/`；可复用 UI 提取到 `components/`。
- 列表渲染必须有独立子组件（如 `MessageList.vue` + `MessageItem.vue`）。

### 4.2 展示组件与容器组件

- **展示组件**：只接收 props、只 emit 事件，不访问 store、不发起 IPC、不处理路由。
- **容器组件 / views**：负责取数、状态编排、权限与错误处理，把结果传给展示组件。
- 展示组件必须能在 Storybook 或测试中脱离应用独立渲染。

### 4.3 Vue 单文件组件约定

- 固定顺序：`<template>` → `<script setup lang="ts">` → `<style scoped lang="less">`。
- 组件名使用 PascalCase 多词命名，禁止单词组件名（如 `Button.vue` 应改为 `PrimaryButton.vue`）。
- `defineProps` / `defineEmits` 必须使用类型声明，默认值通过 `withDefaults`。
- 模板中禁止写复杂表达式，派生数据用 `computed`。
- `v-for` 必须使用稳定主键，禁止使用索引作为 key。
- 禁止在模板中直接调用 `window.nexus`，统一经 `api/` 封装。
- `v-if` 与 `v-for` 不同时用于同一元素。

---

## 5. 命名规范

| 对象 | 规则 | 示例 |
| --- | --- | --- |
| 目录 | kebab-case | `plugin-runtime/` |
| Vue 组件文件 | PascalCase | `ToolCallCard.vue` |
| 普通 TS 文件 | kebab-case | `use-chat-stream.ts` |
| store 文件 | `<module>.store.ts` | `chat.store.ts` |
| API 封装文件 | `<module>.api.ts` | `sessions.api.ts` |
| 类型文件 | `types.ts` | `types.ts` |
| 函数 / 变量 | camelCase | `sendMessage` |
| 类型 / 接口 / 枚举 | PascalCase | `AgentSession` |
| 常量 | UPPER_SNAKE_CASE | `DEFAULT_TIMEOUT_MS` |
| composable | `useXxx` | `useTheme()` |
| store | `useXxxStore` | `useChatStore()` |
| CSS 类 | BEM，前缀 `nh-` | `nh-chat__composer--disabled` |
| IPC 通道 | `domain:action` | `agent:sendMessage` |
| 插件 id | 反向域名 | `nexus.token-usage` |

- 标识符一律英文，禁止拼音与无意义缩写（`tmp`、`data1`、`obj` 禁止）。
- 布尔值用 `is` / `has` / `can` / `should` 前缀。
- 事件名使用 kebab-case，如 `update:modelValue`、`tool-call-expanded`。

---

## 6. 注释规范

### 6.1 允许与禁止

- 允许：`//` 单行注释、`/* ... */` 块注释。
- **禁止**：`/** ... */` 文档注释（JSDoc 风格），任何位置都不得出现。
- 禁止：注释掉的死代码；需要保留的实现请用 Git 历史或 `// TODO` 说明，不得整段注释。
- 禁止：与代码不一致的过期注释。改代码必须同步改注释。
- 禁止：无信息量的注释，如 `// 设置变量`、`// 循环数组`。

### 6.2 必须注释的位置

- 每个文件顶部：用块注释说明文件职责、所属模块、关键约束。
- 每个导出的函数、方法、类型、接口、枚举、常量：上方用块注释说明用途、参数含义、返回值、异常与副作用。
- 每个 store 的 state、getter、action。
- 每个 IPC handler、每个事件订阅与发布。
- 函数内部非显而易见的分支、正则、算法、兼容处理、性能取舍：用 `//` 说明**为什么**这样做，而不是重复代码在做什么。
- 模块级变量必须注释；函数内局部变量在语义不自明时必须注释。
- 复杂代码块（超过约 15 行的逻辑段）在起始处用 `//` 概括该段目的。

### 6.3 注释风格

- 注释语言统一使用**中文**；专有名词、API 名、类型名保留英文。
- 块注释用于“对外说明”，单行注释用于“对内解释”。
- 用 `TODO(负责人): 原因与计划`、`FIXME(负责人): 问题与影响` 标记待办，禁止裸 `TODO`。
- 注释不写变更日志，不写“新增”“修改”等历史信息。

示例：

```ts
/*
 * 将模型返回的工具调用归一化为内部格式。
 * 不同提供商对 arguments 的编码不一致，这里统一为对象并做 schema 校验。
 * 校验失败时抛出 ToolCallParseError，由上层转为可展示的错误消息。
 */
export function normalizeToolCall(raw: RawToolCall): ToolCall {
  // 部分提供商会返回空字符串而不是空对象，需要兜底为空对象
  const args = raw.arguments ? JSON.parse(raw.arguments) : {};

  return { id: raw.id, name: raw.name, arguments: args };
}
```

---

## 7. TypeScript 规范

- 开启 `strict`、`noUncheckedIndexedAccess`、`noImplicitOverride`、`exactOptionalPropertyTypes`。
- 禁止 `any`；无法确定时用 `unknown` 并在边界处收窄。确需逃逸时使用 `// eslint-disable-next-line` 并写明原因。
- 类型导入统一使用 `import type`。
- 对外数据结构优先用 `interface`，联合类型、映射类型用 `type`。
- 禁止非空断言 `!` 滥用；只在已通过校验且注释说明理由时使用。
- 所有跨进程输入、插件 manifest、配置文件必须经 zod 校验后再使用。
- 枚举优先使用 `as const` 对象 + 联合类型，避免 TS `enum`。
- 公共函数必须有显式返回类型。

---

## 8. Vue / Pinia / Router 规范

### 8.1 Pinia

- 一个模块一个 store，使用 setup 语法定义。
- 全局 store 仅限 `theme`、`app`、`layout`；业务状态放模块内 store。
- 禁止跨 store 直接修改对方 state，必须调用对方 action。
- 持久化统一走 `storage` 服务，禁止组件内直接使用 `localStorage`。
- action 内必须处理加载态与错误，禁止把异常静默吞掉。

### 8.2 Router

- 路由按模块拆分，使用懒加载。
- 路由 meta 显式声明 `title`、`requiresWorkspace` 等约束。
- 禁止在组件中硬编码路径字符串，统一从路由常量引用。

### 8.3 Composables

- 命名 `useXxx`，返回对象或元组，禁止返回含义不明的数组。
- 内部副作用（定时器、监听器、订阅）必须在 `onScopeDispose` 或 `onUnmounted` 中清理。
- 异步 composable 必须暴露 `loading`、`error`、`data` 三态。

---

## 9. Less、主题与体验规范

### 9.1 语义 token

`renderer/styles/tokens.less` 定义语义变量名与尺寸、字体、动效等与主题无关的 token；颜色赋值放在 `themes/light.less` 与 `themes/dark.less`。以下为完整语义清单，颜色值仅作 light 主题示例：

```less
/* 背景与表面 */
--nh-color-bg-base: #ffffff;
--nh-color-bg-elevated: #f7f8fa;
--nh-color-bg-hover: #eef0f4;

/* 文本 */
--nh-color-text-primary: #1f2329;
--nh-color-text-secondary: #5c6570;
--nh-color-text-disabled: #a8b0ba;

/* 边框、强调、状态 */
--nh-color-border: #e3e6eb;
--nh-color-accent: #3b82f6;
--nh-color-success: #16a34a;
--nh-color-warning: #d97706;
--nh-color-danger: #dc2626;

/* 尺寸与动效 */
--nh-radius-sm: 4px;
--nh-radius-md: 8px;
--nh-space-sm: 8px;
--nh-space-md: 16px;
--nh-shadow-popover: 0 8px 24px rgb(0 0 0 / 12%);

/* 字体与动效 */
--nh-font-sans: -apple-system, "SF Pro Text", "Segoe UI Variable", "Segoe UI", sans-serif;
--nh-font-mono: "SF Mono", "Cascadia Code", ui-monospace, monospace;
--nh-duration-fast: 120ms;
--nh-duration-base: 200ms;
--nh-duration-panel: 240ms;
--nh-ease-standard: cubic-bezier(0.2, 0, 0, 1);
--nh-ease-emphasized: cubic-bezier(0.2, 0, 0, 1.2);
```

### 9.2 规则

- 组件样式**禁止硬编码颜色**，只能使用 `var(--nh-*)`。
- 主题切换：`<html data-theme="light | dark">`，`theme` store 统一管理 `light / dark / system` 三态。
- `system` 模式监听系统主题变化并实时更新，选择结果持久化。
- Naive UI 的 `themeOverrides` 必须由同一套语义 token 派生，禁止两套色板。
- Less 变量只用于断点、mixins、编译期计算；运行期主题必须用 CSS 变量。
- 每个组件样式加 `scoped`；仅布局根节点、主题定义允许全局选择器。
- 嵌套层级不超过 3 层；禁止 `!important`，除非覆盖第三方库且注释说明。
- 类名遵循 BEM，禁止无意义类名（`box1`、`red`）。
- 字体、动效、阴影、层级同样必须使用 token，禁止在组件内写 `transition: all 0.3s` 之类的魔法值。
- 平台材质与窗口差异统一收敛到 `platform/` 适配层，业务样式不得直接判断操作系统。

### 9.3 插件主题

- 插件 UI 只允许使用 `--nh-*` 语义变量，禁止写死颜色与字体。
- 插件不得覆盖全局 token，只能读取；主题贡献点开放后需单独评审。

### 9.4 设计原则（Apple 对齐）

- **清晰（Clarity）**：界面只呈现当前任务需要的信息，默认态干净，细节按需展开。
- **克制（Deference）**：UI 让位于内容，禁止装饰性渐变、重阴影与彩色堆砌。
- **深度（Depth）**：用层级、材质与动效表达结构关系，不做无意义的动画。
- **键盘优先**：核心操作都可用快捷键完成；`Cmd/Ctrl+K` 打开命令面板；快捷键集中注册并可在设置中查看。
- **直接操作**：拖拽、内联编辑、就地 diff，避免为简单动作跳转新页面。
- **渐进披露**：低频高级选项折叠，主流程不出现无关配置。
- **审批融入心流**：工具审批以行内面板或浮层呈现，必须展示将要执行的内容与影响范围，不能做成打断式网页弹窗。
- **默认优于配置**：优先给出合理默认值，避免大面积设置页。

V1 默认贴近 macOS 原生质感，保留自有品牌识别的演进空间；视觉方向调整必须评审并更新本文件。

### 9.5 动效与质感

- 只使用动效 token：即时反馈 `--nh-duration-fast`，常规过渡 `--nh-duration-base`，面板进出 `--nh-duration-panel`。
- 动效只用于解释状态变化（出现、消失、层级迁移），不用于装饰或延迟用户操作。
- 必须尊重 `prefers-reduced-motion`，在该偏好下降级为无动画或纯淡入淡出。
- 滚动使用系统原生惯性；长列表必须虚拟化，避免布局抖动与整页重排。
- 材质与层级：macOS 使用半透明与背景模糊（vibrancy），Windows 使用 Mica 或纯色回退，均不得硬编码色值。

### 9.6 平台适配

- **macOS 为主**：隐藏式标题栏与原生红绿灯、原生菜单、Dock 行为、全屏、窗口状态记忆、系统文件对话框与拖放。
- **Windows 兼容**：遵循 Windows 窗口控件与字体习惯，使用 Mica 或纯色回退；不强行复制 macOS 控件。
- 字体优先系统栈（macOS `-apple-system` / SF Pro，Windows `Segoe UI Variable`），不把第三方字体作为默认。
- 平台差异集中封装在 `renderer/platform/` 与主进程 `app/` 层，业务组件不得散落 `process.platform` 判断。

### 9.7 性能预算

- 冷启动到可交互目标 < 1.5s（Apple Silicon 基准）；Windows 同档硬件不得明显劣化。
- 输入与滚动保持 60fps；单次主线程任务 < 16ms，重计算放入 Worker 或主进程。
- 路由、编辑器、终端、图表等重模块全部懒加载，首屏只加载当前界面。
- 列表超过 50 项必须虚拟化；流式消息采用增量更新，禁止整列表重渲染。
- 新增依赖必须评估包体积与启动开销，核心界面不引入重型 UI 依赖。

---

## 10. IPC 与进程边界

- 主窗口必须开启 `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`。
- preload 只通过 `contextBridge` 暴露 `window.nexus`，按命名空间组织：`nexus.agent`、`nexus.session`、`nexus.workspace`、`nexus.plugin`、`nexus.settings`。
- 通道常量与 zod schema 统一定义在 `packages/shared`，主进程与 preload 共用。
- 主进程在处理前必须 `schema.parse`，禁止信任渲染进程输入。
- 统一返回结构：

```ts
type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };
```

- 流式数据使用事件通道，命名 `domain:event`；订阅必须返回取消函数，组件卸载时调用。
- 错误码使用大写下划线形式，如 `TOOL_PERMISSION_DENIED`、`PROVIDER_UNAUTHORIZED`。
- 权限校验、路径白名单、命令拦截必须在主进程服务层完成，不能只靠 UI 限制。

---

## 11. 插件体系

### 11.1 模型

- V1 采用**同进程可信插件**：插件是普通 JS 模块，由宿主加载，能力由 manifest 权限约束。
- 分发方式：**仅内置插件**。源码位于仓库根 `plugins/<id>`，构建时打包进应用资源目录，运行时由宿主内置清单注册并从只读资源目录加载。
- V1 不提供外部安装、用户目录扫描与插件市场，只支持启用/禁用与设置项；外部插件能力留到后续版本再设计。
- 插件只能依赖 `@nexus/plugin-sdk`，禁止直接依赖 Electron、Node 原生模块或内部包。

### 11.2 manifest

插件根目录必须包含 `plugin.json`，加载前用 zod 校验：

```json
{
  "id": "nexus.token-usage",
  "name": "Token 用量",
  "version": "1.0.0",
  "engines": { "nexus": "^0.1.0" },
  "main": "dist/main.js",
  "renderer": "dist/renderer.js",
  "activationEvents": ["onView:usage.panel", "onEvent:agent.usage"],
  "permissions": ["storage", "events:agent.usage", "ui.panel", "ui.statusbar"],
  "contributes": {
    "views": [{ "id": "usage.panel", "title": "用量", "location": "sidebar" }],
    "statusBar": [{ "id": "usage.status", "align": "right" }],
    "commands": [{ "id": "usage.reset", "title": "重置统计" }],
    "settings": [
      { "key": "usage.currency", "type": "string", "default": "USD" }
    ]
  }
}
```

- `id` 必须全局唯一，使用反向域名。
- `version` 遵循 semver；`engines.nexus` 声明兼容的宿主版本范围。
- `activationEvents` 必须按需激活，禁止无条件在启动时加载所有插件。
- 权限必须最小化；未声明的能力调用会被宿主拒绝并记录日志。

### 11.3 贡献点

| 贡献点 | 用途 |
| --- | --- |
| `views` | 侧栏、主区、底部面板 |
| `statusBar` | 状态栏条目 |
| `commands` | 命令面板与快捷键绑定 |
| `menus` | 上下文菜单、工具栏 |
| `settings` | 插件设置项 |
| `tools` | 向 Agent 注册工具（高风险权限） |
| `themes` | 后续开放，需单独评审 |

### 11.4 宿主 API

`@nexus/plugin-sdk` 是唯一对外 API，所有能力经权限网关：

```ts
ctx.commands.register(id: string, handler: () => void | Promise<void>): Disposable;
ctx.views.register(id: string, mount: (el: HTMLElement, ctx: PluginContext) => () => void): Disposable;
ctx.statusBar.add(item: StatusBarItem): Disposable;
ctx.events.on(event: NexusEventName, handler: (payload: unknown) => void): Disposable;
ctx.storage.get<T>(key: string): Promise<T | undefined>;
ctx.storage.set<T>(key: string, value: T): Promise<void>;
ctx.storage.delete(key: string): Promise<void>;
ctx.logger.info(message: string, meta?: unknown): void;
ctx.notifications.show(message: string, level?: 'info' | 'warning' | 'error'): void;
ctx.workspace.readFile(path: string): Promise<string>;
ctx.workspace.list(dir: string): Promise<WorkspaceEntry[]>;
```

- 每个注册接口返回 `Disposable`，插件被禁用或卸载时必须释放全部资源。
- `ctx.storage` 按插件 id 隔离，禁止跨插件读取。
- `ctx.views.register` 的 mount 函数必须返回清理函数；宿主负责容器与生命周期。
- 事件 payload 类型由 SDK 导出，禁止插件假设未声明字段存在。

### 11.5 生命周期与容错

```text
发现 -> manifest 校验 -> 版本兼容检查 -> 权限登记 -> activate(ctx)
     -> 挂载贡献点 -> 使用 -> deactivate() -> 清理
```

- 激活失败必须捕获并记录，自动禁用该插件，不得影响宿主启动。
- 插件回调抛出的异常由宿主包裹捕获，转为通知与日志。
- 开发态支持热重载；生产态禁用未通过校验的插件。
- 禁用或卸载插件前必须调用 `deactivate()`，并清理其贡献点与存储索引（存储是否保留由用户选择）。

### 11.6 样板插件

`plugins/token-usage` 是插件开发的参考实现，必须持续保持可运行，并演示：

- 订阅 `agent.usage` 事件并聚合统计。
- 通过 `statusBar` 显示当前会话消耗。
- 通过 `views` 注册侧栏面板，图表的颜色全部来自语义 token。
- 使用 `ctx.storage` 持久化累计数据。
- 正确处理启用、禁用、热重载。

---

## 12. 错误处理与日志

- 禁止空 `catch`；必须处理、转换或重新抛出并附加上下文。
- 用户可见错误必须包含可操作信息，不得直接暴露堆栈。
- 预期内错误用 `Result` 返回；真正异常才 `throw`，并在边界统一转换。
- 日志分级 `debug / info / warn / error`，包含模块名与关键上下文字段。
- 禁止在日志中输出 API Key、完整请求头、用户隐私路径内容。
- 主进程未捕获异常必须接入统一处理器并提示用户重启。

---

## 13. 测试

- `packages/*` 核心逻辑必须有单元测试，使用 Vitest。
- 组件使用 Vue Test Utils 测试关键交互与条件渲染。
- 模型调用统一 mock `packages/providers`，测试不依赖真实网络。
- 插件宿主需有 manifest 校验、权限拒绝、激活失败的测试。
- 新增功能与修复缺陷必须附带对应测试；无法测试时需在提交说明中写明原因。

---

## 14. 构建、脚本与质量门禁

根目录提供以下脚本，提交前全部通过：

```bash
pnpm dev          # 开发
pnpm build        # 构建
pnpm typecheck    # 类型检查
pnpm lint         # ESLint
pnpm lint:style   # stylelint
pnpm test         # 单元测试
pnpm format       # Prettier
```

- 禁止提交 `typecheck` 或 `lint` 失败代码。
- 禁止在源码中写死环境路径、密钥、服务地址。
- 依赖新增必须在 PR 说明用途与替代方案评估。
- 构建产物、插件产物、日志文件不得入库。

---

## 15. Git 规范

- 使用 Conventional Commits：`<type>(<scope>): <subject>`。
- type：`feat`、`fix`、`refactor`、`perf`、`docs`、`test`、`build`、`chore`。
- scope 使用模块名：`chat`、`session`、`workspace`、`plugin-host`、`providers`、`orchestrator`。
- 一次提交只做一件逻辑上的事；重构与功能改动分开提交。
- 提交前检查 `git diff`，禁止提交调试代码、临时日志、密钥。
- 不得擅自改写他人提交历史或强推共享分支。

---

## 16. 里程碑

| 阶段 | 内容 |
| --- | --- |
| M0 | 规范、monorepo 骨架、electron-vite + Vue、类型化 IPC、深浅主题与动效 token、布局占位 |
| M1 | 单 Agent 代码闭环：多提供商、流式对话、工具调用、审批、事件流持久化、读改跑测验证 |
| M2 | 工作区：文件树、Monaco、diff、检查点回滚、终端 |
| M3 | 工具完善、内置 Skill 加载与 MCP 客户端 |
| M4 | 插件宿主、贡献点、内置插件启用/禁用页、`token-usage` 样板 |
| M5 | 多 Agent 编排（worktree 并行、预算）与产品化打包 |

---

## 17. 新代码自检清单

提交前逐项确认：

- [ ] 文件位置符合目录职责，没有跨模块深路径引用。
- [ ] 组件已按标准拆分，展示组件不访问 store 与 IPC。
- [ ] 命名符合第 5 节，无拼音、无无意义缩写。
- [ ] 新能力通过 tool / skill / plugin 进入，`core` 中没有领域硬编码。
- [ ] 所有导出成员与关键代码块有中文注释；没有 `/** */`；没有死代码。
- [ ] 所有颜色来自语义 token，深浅主题下均已检查。
- [ ] 动效使用 token，`prefers-reduced-motion` 与 Windows 回退均已验证。
- [ ] 长列表已虚拟化，重计算没有阻塞渲染主线程。
- [ ] 跨进程数据经过 zod 校验，公开方法有显式返回类型。
- [ ] 插件新增能力已声明权限，未绕过宿主 API 直接访问系统资源。
- [ ] 副作用有清理逻辑，错误被处理且不泄露敏感信息。
- [ ] 新增逻辑有测试，`typecheck`、`lint`、`test` 全部通过。
- [ ] 提交信息符合 Conventional Commits，提交内容单一。
