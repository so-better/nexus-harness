# Nexus 开发规范

本文件是本仓库的**唯一强制性开发规范**。所有人（包括 AI 协作方）在新增、修改、重构代码前必须先阅读并遵守。规范与临时便利冲突时，以本文件为准；确需例外时，必须在代码评审中说明理由，并同步更新本文件。

### 文档维护约定

本文件是**活文档**，随项目演进持续调整；第 3 节的目录结构是当前基线，不是永久约束。允许根据实际需求重组目录、拆分或合并模块，但必须满足以下条件：

- 调整前说明动机与影响范围，避免为了短期便利破坏分层原则。
- 结构性变更与规范变更必须在同一次提交中同步更新本文件。
- 若新结构与本文冲突，以更新后的本文为准，不得只改代码不改文档。
- 产品定位、能力分层、设计原则等讨论结论也应沉淀到本文件；内容过多时可拆分到 `docs/`，但本文件必须保留索引与结论。
- 定期回顾本文件，删除已失效的约定，保持与实际代码一致。

### 目录

1. 产品定义
2. 概念与对象模型
3. 架构总览
4. 核心子系统契约
5. 体验与设计规范
6. 工程规范
7. 路线图与验收
8. 开源与社区
9. 待决策与开放问题
10. 新代码自检清单
11. 附录

---

## 1. 产品定义

### 1.1 定位与描述

Nexus 是一个桌面端 AI Agent 工作台：不是聊天框，也不是只服务某一种任务的工具，而是让 Agent 在统一运行时内可靠完成真实任务的工作台。

产品采用“底层通用、方向外置”的策略：核心只提供与领域无关的 agent 运行时，具体能力通过工具、技能与插件扩展；`core` 不假设任何具体领域，研究、文档、数据、代码等场景都以扩展方式接入。

**Agent 与 Harness 的区别**：Agent 是模型驱动的执行者，负责“思考 → 调工具 → 观察 → 继续”；Harness 是承载与约束 Agent 的运行时，负责上下文、工具执行、权限审批、事件流、检查点回滚与 UI。Agent 是能力，Harness 是让能力变成稳定产出的工程体系。

产品描述：

> Nexus 是一个面向真实任务的 AI Agent 工作台。Agent 能调用工具完成任务、验证结果并自我修正；所有工具调用、审批、变更与费用都可审计，文件修改必须在写入前明确审批。能力通过工具、技能与插件持续扩展。

电梯陈述：

> 我们不只做一个聊天框，而是造一个能让 Agent 真正完成任务的可靠工作台。

体验目标：对齐 Apple 的设计与交互水准，macOS 优先，Windows 兼容。

成本目标：完成同等任务时尽量少消耗 token。功能设计、提示词、上下文组装、工具输出与界面展示都必须以“最小必要上下文”为约束，不能为了实现方便把大段无关内容塞给模型。

定位禁区：不使用“全能 AI 助手”“聊天 + 工具”“自动化一切”等模糊或过度承诺的表述。

### 1.2 目标用户与典型场景

目标用户假设，后续需用真实反馈修正：

| 用户 | 主要任务 | 最在意 |
| --- | --- | --- |
| 独立开发者 | 修 bug、加功能、补测试 | 快、可控、不要改坏 |
| 小团队工程师 | 项目巡检、重构、迁移 | 可审计、可回滚、可复现 |
| 知识工作者 | 整理资料、修改文档、生成报告 | 准确、可控、格式一致 |
| 非职业开发者 / 创作者 | 做原型、小工具、游戏 Demo | 能跑起来、少配置 |

核心场景：

1. **修复缺陷**：复现问题 → 定位文件 → 修改 → 跑测试 → 自修复。
2. **实现小功能**：描述需求 → 生成计划 → 修改文件 → 运行验证。
3. **文档与内容修改**：定位文件 → 改写内容 → 检查格式、引用与一致性。
4. **数据处理与脚本**：读取数据文件 → 编写或修改脚本 → 运行 → 校验输出。
5. **理解项目**：解释目录结构、调用链、影响面，回答工作区问题。
6. **小步重构**：拆分步骤，每一步都运行验证，失败可回滚。

以上场景是当前的重点示例；能力边界不写死，后续通过工具、技能与插件持续扩展。

### 1.3 能力扩展

核心保持领域无关，不限定具体产品边界。能力通过工具、技能与插件扩展：工具提供原子动作，技能描述任务方法，插件负责 UI 与集成；插件、技能与 MCP 均从 `<userData>` 目录扫描并自动注册。具体分层与契约见第 3.5 节。

**非核心功能插件优先**：除 Agent 运行时、工具执行与审批、安全沙箱、事件持久化、基础 UI 外壳等核心能力外，使用统计、主题皮肤、附加面板、通知增强、第三方集成等非核心功能默认实现为内置插件。内置插件与第三方插件使用同一 manifest、权限、事件与贡献点契约，不享受特权，可被禁用、替换或卸载。

**设计先问插件化**：任何功能在设计阶段都必须先评估能否以插件形式实现，默认按插件设计；只有确认会改变核心安全、数据、调度契约或基础 UI 外壳时才允许内置。不得以“先内置、以后再拆”为理由绕过，不能插件化时必须在设计与提交说明中写明原因。

扩展契约先行：事件总线、标准插槽、权限网关与贡献点注册表必须在对应功能开发时同步埋好，不能等插件系统完成后再补。

### 1.4 核心体验流程

1. **首次启动**：选择或配置模型提供商，API Key 随本地 Provider 配置保存；主题跟随系统。
2. **打开工作区或直接开始**：可先选择工作区目录并确认信任级别，也可不打开工作区直接开始任务；建立文件索引；当前工作区在会话头展示。
3. **描述任务**：在输入区写目标；输入 `@` 引用工作区内的文件；输入 `/` 浏览并主动调用 Skill；选择审批策略。
4. **生成计划**：Plan 模式下 Agent 只读分析并给出步骤与验收标准，不执行任何本地操作；用户确认后切换到 Build 执行。
5. **执行**：流式输出思考与工具调用；写文件前展示 diff，危险命令请求审批；需要澄清时以行内卡片提问，Run 暂停等待回答；工具生成或下载的文件保存到 `<userData>/files` 并在会话流中展示文件卡片；用户可随时停止回复、编辑用户消息重发，或对最后一条回复重新生成。
6. **验证**：按任务类型运行验证命令（代码任务跑测试、类型检查与 lint，文档任务检查格式与引用，数据任务运行脚本校验输出）；失败则进入自修复循环。
7. **审批**：写文件与执行命令前展示实际 diff、路径、命令、cwd 与影响范围，用户确认后才执行。
8. **完成**：给出变更摘要、验证结果、token 与费用；AI 输出文件可另存到用户指定目录，由专业软件打开。深度审阅与回滚交给外部工具。

失败路径必须明确：模型超时、提供商报错、工具失败、审批拒绝、验证不通过，都要有可操作的下一步，不能停在无反馈的加载态。

### 1.5 信息架构

```text
┌──────────────────────────────────────────────┐
│ 标题栏：工作区/临时会话切换 / 模型 / 命令面板  │
├──────────┬──────────────────────┬────────────┤
│ 侧栏      │ 主区                 │ 检查器/终端 │
│ 会话列表  │ 会话标签 / 会话流     │ 上下文/用量 │
│ 工作区      │ 会话流 / 终端          │ 审批详情   │
│ 扩展面板  │                      │            │
├──────────┴──────────────────────┴────────────┤
│ 状态栏：Agent 状态 / tokens / 成本 / 插件条目  │
└──────────────────────────────────────────────┘
```

主要界面：

| 界面 | 职责 |
| --- | --- |
| Session 视图 | 多会话标签、对话流、工具调用、审批、文件卡片、计划与结果 |
| Workspace 视图 | 当前工作区、会话流与审批详情 |
| Command Palette | 全局命令、文件跳转、设置入口 |
| Settings | 提供商、模型、权限、外观、快捷键、高级、关于（弹窗） |
| Extensions | 插件、Skill、MCP 的扫描结果、启用/禁用与权限查看（弹窗） |
| Status Bar | 运行状态、成本、插件贡献项 |
| Terminal 面板 | 右侧可拖拽面板：多终端标签、运行状态与关闭确认，不使用外部终端 |

交互约定：

- 审批在会话流内联展示，不弹网页式模态框。
- 状态栏提供终端入口，打开右侧终端面板；默认宽度 600px、最大 720px 且保证对话区至少 420px，可拖拽调整，终端固定深色。
- 终端支持多标签；关闭运行中的终端需二次确认；标签右键支持关闭当前/其他/右侧与重命名。
- AI 执行命令时直接创建终端标签，不启动外部终端程序；无工作区时终端默认位于文件系统根目录。
- 会话头展示当前工作区，支持选择、替换或移除工作区。
- 支持同时打开多个会话标签；切换标签不中断后台 Run。
- 会话支持重命名、置顶、导出与跨会话搜索；搜索入口在侧栏与命令面板。
- 输入区展示当前 Agent 模式，Plan / Build 切换只能由用户操作。
- 设置与扩展以弹窗展示，不引入路由；视图切换由导航状态驱动。
- 插件通过标准插槽注入会话流与输入区，全局背景以 skin 贡献，不改变宿主布局。
- Agent 提问以行内卡片展示，支持键盘选择、数字键、Enter 提交与 Esc 取消。
- 用户消息可编辑重发；最后一条 AI 回复可重新生成；流式回复可随时停止。
- 高频操作全部可键盘完成，`Cmd/Ctrl+K` 为统一入口。
- 低频设置折叠，主流程不出现无关配置。
- 侧栏与主区可拖拽调整，布局状态持久化。

### 1.6 成功指标

| 指标 | 目标 | 衡量方式 |
| --- | --- | --- |
| 基准任务完成率 | ≥ 80%（内部 10 个真实任务，含代码与文档/数据任务） | 自动化评测 + 人工验收 |
| 单任务人工干预 | ≤ 3 次 | 审批与补充消息计数 |
| 回滚成功率 | 100% | 检查点恢复测试 |
| 崩溃恢复 | 100% 不丢事件 | 重启回放测试 |
| 首字延迟 P95 | < 2s（不含模型排队） | 本地埋点 |
| 成本可见性 | 100% 调用有 usage | 事件核对 |
| 任务 token 效率 | 同类任务平均 token 不因新功能回退，逐步下降 | 按任务类型对比 usage 回归 |
| 冷启动 | < 1.5s（Apple Silicon） | 启动计时 |

---

## 2. 概念与对象模型

### 2.1 术语表

| 术语 | 含义 |
| --- | --- |
| Harness | 承载 Agent 的运行时，负责上下文、工具、权限、事件、回滚与 UI |
| Agent | 模型驱动的执行循环，当前只有单 Agent |
| Agent 模式 | `plan` 只读规划，`build` 执行变更 |
| Ask User | Agent 的结构化提问，暂停 Run 等待用户选择或输入 |
| Provider | 模型服务商适配器，如 OpenAI 兼容、Anthropic、Ollama |
| Workspace | 单个工作区目录与信任设置，作为项目级预设 |
| Session | 一次持续的工作上下文，可选绑定一个 Workspace |
| Session 标题 | 会话名称，自动摘要或用户重命名 |
| Scope | Session 的执行范围，由 workspaceId 与唯一工作区目录组成 |
| RootGrant | 用户授权给会话的文件或目录，以及读/写级别 |
| Run | 一次执行尝试，包含计划、工具调用与验证 |
| Task | 用户目标与验收标准，通常一个 Session 只有一个 Task |
| Turn | 一轮用户输入与 Agent 响应 |
| ToolCall | Agent 发起的一次工具调用 |
| Approval | 对高风险工具调用的用户授权 |
| Checkpoint | 可恢复的文件快照标记 |
| Compaction | 上下文超出预算时的自动摘要与裁剪 |
| Artifact | 工具产生的结构化产物，如 diff、日志、报告 |
| OutputFile | AI 生成或下载的文件，保存在 `<userData>/files` |
| Skill | 声明式任务包，指导 Agent 如何完成某类任务 |
| Plugin | 运行时扩展，提供 UI、命令、事件订阅与设置 |
| MCP Server | 通过 stdio 或 HTTP 提供工具的外部进程，配置位于 `<userData>/mcp` |
| Usage | 一次模型调用的 token 与费用记录 |
| Event | 会话事件流中的一条不可变记录 |

### 2.2 对象模型

| 对象 | 关键字段 | 说明 |
| --- | --- | --- |
| Workspace | id、name、root、trustLevel、createdAt | 单个工作区目录与信任状态 |
| Session | id、workspaceId?、title、titleSource、pinned、status、mode、providerId?、modelId?、scope、createdAt、lastActiveAt | 一次工作上下文，工作区可选 |
| RootGrant | id、sessionId、path、kind、access、source、createdAt | 会话的唯一工作区授权 |
| Task | id、sessionId、goal、acceptanceCriteria、status | 用户目标与验收标准 |
| Run | id、sessionId、taskId、status、budget、startedAt、endedAt | 一次执行尝试 |
| Message | id、runId、role、content、toolCallIds、status、createdAt | 消息与工具调用引用；status 为 normal / superseded / partial |
| ToolCall | id、runId、name、input、status、approvalId | 工具调用请求 |
| ToolResult | callId、ok、output、artifacts、error | 工具调用结果 |
| Approval | id、toolCallId、scope、status、requestedAt、resolvedAt | 审批记录 |
| Checkpoint | id、sessionId、runId、label、snapshotRef、files、createdAt | 逐文件快照 |
| Artifact | id、runId、type、path、mime、bytes | 工具产物 |
| OutputFile | id、sessionId、runId、name、mime、bytes、source、storedPath、createdAt | AI 生成或下载的文件 |
| Usage | id、runId、provider、model、inputTokens、outputTokens、cost | 用量与费用 |
| Event | id、sessionId、runId、seq、type、version、ts、payload | 事件流记录 |

关系约束：

```text
Workspace 0..1 ── n Session
Session   1 ── 1 RootGrant
Session   1 ── n Task
Task      1 ── n Run
Run       1 ── n Message
Run       1 ── n ToolCall ── 1 ToolResult
Run       1 ── n Approval
Run       1 ── n Artifact
Run       1 ── n OutputFile
Run       1 ── n Usage
Session   1 ── n Checkpoint
Session   1 ── n Event
```

### 2.3 状态机

| 对象 | 状态 |
| --- | --- |
| Workspace | `untrusted` → `trusted`；异常进入 `error` |
| Session | `idle` → `running` → `waiting_approval` / `waiting_user` → `completed` / `failed` / `interrupted` → `archived` |
| Task | `pending` → `running` → `completed` / `failed` / `cancelled` |
| Message | `normal` → `partial` / `superseded` |
| Run | `queued` → `running` → `waiting_approval` / `waiting_user` → `succeeded` / `failed` / `cancelled` / `interrupted` |
| ToolCall | `requested` → `approved` / `rejected` → `running` → `succeeded` / `failed` |
| Approval | `pending` → `approved` / `rejected` / `expired` |
| Checkpoint | `created` → `restored` |

### 2.4 不变量

- 一个 Session 最多绑定一个 Workspace；绑定后不可切换到其他 Workspace，跨工作区必须新建 Session。
- Session 的允许路径由唯一 Workspace root 与 Session RootGrant 共同组成。
- ad-hoc RootGrant 只对当前 Session 生效，不跨会话继承；授权与撤销必须写入 scope 事件。
- 每个 Session 同时最多一个活跃 Run；多个 Session 可并行运行，受全局并发与 provider 限额约束。
- 会话标题：用户重命名优先于自动标题，自动标题不得覆盖用户标题。
- 任何工具调用执行前必须先写入 `tool.requested` 事件；高风险调用还需 `approval.requested`。
- 等待用户回答时 Run 进入 `waiting_user`，不得继续执行工具；提问与回答必须写入事件。
- 任何工作区文件写入必须先创建或关联 Checkpoint，确保可回滚；写入 `files` 内部存储不在此列。
- 每条 Usage 必须包含 provider、model 与 token 明细，不允许只记录总费用。
- 事件一旦写入不可修改；修正通过追加新事件表达。
- 编辑消息或重新生成不得物理删除历史事件；旧消息标记 `superseded`，停止回复保留已生成内容并标记 `partial`。

---

## 3. 架构总览

### 3.1 技术栈与版本

| 类别 | 选型 | 主版本 |
| --- | --- | --- |
| 运行时 | Node.js | 24.x |
| 包管理 | pnpm workspace | 10.x |
| 桌面壳 | Electron | 45.x |
| 构建 | electron-vite | 6.x |
| 前端框架 | Vue | 3.5.x |
| 语言 | TypeScript | 5.9.x |
| 样式 | Less | 4.x |
| 组件库 | Naive UI | 2.45.x |
| 状态 | Pinia | 4.x |
| 契约校验 | zod | 4.x |
| 打包 | electron-builder | 26.x |
| 终端 | @xterm/xterm + node-pty | 6.x / 1.x |
| Markdown | marked + DOMPurify + highlight.js + KaTeX + ECharts + Mermaid | 以 package.json 为准 |
| 文档生成 | docx / exceljs / pptxgenjs / pdfkit | 9.x / 4.x / 4.x / 0.20.x |
| LLM SDK | openai / @anthropic-ai/sdk | 7.x / 1.x |
| MCP | @modelcontextprotocol/sdk | 1.x |
| 测试 | Vitest | 5.x |
| 质量 | ESLint / Prettier / stylelint | 10.x / 3.x / 18.x |

版本以 `package.json` 为准；升级主版本必须单独提交并说明影响范围。TypeScript 7 暂无兼容的 `vue-tsc`，当前使用 5.9，升级前必须先验证类型检查链路。

### 3.2 仓库结构

以下结构是当前基线，可按“文档维护约定”演进，调整时必须同步更新本文件。

```text
nexus-harness/
├─ AGENTS.md                     # 本规范
├─ README.md                     # 产品介绍与使用说明
├─ package.json                  # workspace 根脚本与统一依赖版本
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ docs/                         # 产品、架构与决策记录
│  ├─ decisions/                 # ADR 决策记录
│  └─ ...
├─ apps/
│  └─ desktop/
│     ├─ build/                  # 应用图标与打包资源
│     ├─ resources/plugins/      # 内置插件，启动时同步到 userData/plugins
│     ├─ electron.vite.config.ts
│     └─ src/
│        ├─ main/                # Electron 主进程
│        │  ├─ app/              # 生命周期、窗口、菜单、托盘、单实例
│        │  ├─ ipc/              # 按域拆分的 IPC handler
│        │  ├─ services/
│        │  │  ├─ agent/         # 会话循环、上下文、检查点
│        │  │  ├─ provider/      # 模型提供商适配器管理
│        │  │  ├─ tool/          # 工具执行与审批
│        │  │  ├─ workspace/     # 工作区、scope 与 root 授权
│        │  │  ├─ skill/         # Skill 目录扫描与解析
│        │  │  ├─ mcp/           # MCP 配置扫描、进程与工具注册
│        │  │  ├─ plugin-host/   # 插件发现、加载、权限、事件分发
│        │  │  ├─ storage/       # 持久化（会话、设置、工作区索引）
│        │  │  ├─ files/         # AI 输出文件存储与另存为
│        │  │  ├─ search/        # 跨会话全文索引与查询
│        │  │  ├─ export/        # 会话导出（Markdown/HTML/PDF）
│        │  └─ security/         # 沙箱、路径白名单、命令拦截
│        ├─ preload/             # contextBridge 唯一入口
│        └─ renderer/
│           ├─ app/              # 启动、全局 provider、导航状态
│           ├─ layouts/          # 主布局、侧栏、面板容器
│           ├─ modules/          # 功能模块（chat、workspace、extensions 等，见 3.4）
│           ├─ components/       # 跨模块通用原子组件
│           ├─ plugin-runtime/   # 插件宿主、贡献点渲染、权限提示
│           ├─ composables/      # 跨模块通用逻辑
│           ├─ stores/           # 仅全局 store（theme / app / layout）
│           ├─ platform/         # macOS / Windows 平台差异适配
│           ├─ styles/           # tokens、主题、mixins
│           └─ types/            # 全局类型声明
├─ packages/
│  ├─ shared/                    # zod 契约、跨端类型、插件 API 类型、常量、IPC 通道
│  ├─ core/                      # agent 循环、事件流、工具注册表、权限模型
│  ├─ providers/                 # 统一 LLM 抽象（纯 TS，不依赖 Electron/Vue）
│  ├─ toolkit/                   # 每个 AI 工具一个目录的实现；内部共享代码不对外导出
│  └─ runtime-utils/             # 路径、URL 安全、Shell 环境等通用工具
```

### 3.3 分层与依赖方向

```text
renderer ──> shared
preload  ──> shared
main     ──> shared + packages
packages ──> shared（packages 之间允许，但禁止反向依赖 apps）
```

- `packages/core`、`packages/providers`、`packages/toolkit`、`packages/runtime-utils` **禁止**依赖 Electron、Vue、DOM。
- 渲染层**禁止**直接 import `electron`、`node:*`、`fs` 等模块。
- 跨进程数据必须定义在 `packages/shared`，并用 zod 校验。
- `packages/*` 只服务本仓库，**不发布 npm**；应用引用统一使用 `workspace:*`，不对外承诺 API 兼容性。
- 插件无需导入宿主包；宿主在激活时注入 `ctx`。第三方依赖必须自行打包进插件目录，禁止 import `@nexus/core`、`@nexus/shared`、`apps/desktop` 等内部包。
- `packages/*` 只放纯逻辑与实现；`main/services/*` 负责 Electron 绑定、审批编排、沙箱、配置与持久化。
- `packages/toolkit/src/tools/<tool>/` 只放 AI 工具；每个目录包含自己的 schema、定义和执行实现，并配有 `index.test.ts`。`packages/toolkit/src/internal/` 放跨工具共享逻辑；`file-toolset.ts` 只做授权 root 绑定与分发，不新增 AI 工具。`document/` 是 `save_*` 的内部实现库，不从 `@nexus/toolkit` 对外导出。

### 3.4 功能模块内部结构

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

### 3.5 能力分层

产品能力分为三层，职责不可混用：

- **Tool（工具）**：原子、可审批的动作单元，输入输出由 zod 定义，在主进程执行，如读写文件、执行命令、网络请求、MCP 调用。工具回答“能做什么”。
- **Skill（技能）**：声明式任务包，包含说明、资源与可选脚本，告诉 Agent“某类任务该怎么做”。技能不直接获得进程权限，只能通过工具行动。
- **Plugin（插件）**：运行时扩展，通过贡献点添加 UI、命令、事件订阅与设置；注册工具的能力留到后续。插件负责“集成与产品化扩展”。

MCP Server 不是独立能力层，而是工具来源：配置位于 `<userData>/mcp`，启动后把工具注册进 Tool 层。

约束：

- 领域方向只能通过 tool / skill / plugin 进入；`packages/core` 禁止出现针对具体行业或场景的硬编码分支。
- 新能力优先实现为 skill 或 tool；只有需要 UI、事件订阅或第三方集成时才做 plugin。
- **非核心功能优先插件化**：不改变核心安全、数据与调度契约的附加能力，应使用内置插件交付，而不是直接堆进 `core` 或主界面。
- **先设计、再决定是否内置**：新功能先按插件贡献点、事件钩子与宿主 API 评估；能插件化的一律插件化，只有核心契约能力才进入宿主。
- 内置插件是默认产品能力的一部分，但只改变分发方式，不获得额外权限；与用户安装的插件走同一套加载、权限与容错流程。
- 技能、插件、MCP 全部从 `<userData>` 扫描，目录存在即注册；仓库只内置 `apps/desktop/resources/plugins/`，Skill 与 MCP 不提供仓库内样板。
- 目录变化时重新扫描；无效条目记录错误并跳过，不影响启动。

技能目录结构：

```text
<userData>/skills/<skill-id>/
├─ SKILL.md             # 触发条件、步骤、约束与验收标准
├─ assets/              # 模板、参考文件（可选）
└─ scripts/             # 可选脚本，执行前必须经过工具审批
```

### 3.6 会话事件模型

- 会话以 append-only 事件流持久化，事件只追加、不修改、不删除。
- UI 只渲染事件流的投影状态，不持有业务真相；应用重启或崩溃后可从事件流恢复。
- 任何会改变工作区或产生费用的动作，必须先记录 `tool.requested` 或审批事件再执行，保证可审计、可回放、可回滚。
- 插件通过宿主事件总线订阅，payload 由 `packages/shared` 定义并校验，宿主按权限过滤。
- `message.delta` 按时间或长度合并后持久化，用于流式恢复；最终内容仍由 `message.completed` 持久化。
- 事件与插槽契约先于功能实现定义；所有新功能必须同步发出领域事件并暴露标准插槽。

命名约定：

| 对象 | 规则 | 示例 |
| --- | --- | --- |
| IPC 命令通道 | `域:动作` | `agent:sendMessage` |
| 领域事件 | `域.过去式动作` | `tool.completed` |
| 插件激活事件 | `onEvent:<领域事件>` | `onEvent:usage.recorded` |
| 插件视图激活 | `onView:<viewId>` | `onView:usage.panel` |
| 插件插槽激活 | `onSlot:<slotId>` | `onSlot:usage.inline` |

事件信封：

```ts
/**
 * 事件信封是所有持久化事件的统一外层结构，payload 由具体事件类型定义
 */
interface NexusEvent<T = unknown> {
  id: string;
  sessionId: string;
  runId?: string;
  seq: number;
  type: NexusEventType;
  version: number;
  ts: number;
  payload: T;
}
```

---

## 4. 核心子系统契约

### 4.1 Provider 抽象与能力矩阵

统一接口只暴露归一化后的请求与流式事件，禁止 UI 或 core 直接依赖某家 SDK 的原始类型。

```ts
/**
 * 模型能力声明，用于设置页提示与降级说明；视觉输入默认发送，不因声明缺失而丢弃
 */
interface ProviderCapabilities {
  streaming: boolean;
  toolCalling: boolean;
  vision: boolean;
  reasoning: boolean;
  promptCaching: boolean;
}
```

归一化流式事件：

| 事件 | 含义 |
| --- | --- |
| `text-delta` | 文本增量 |
| `reasoning-delta` | 推理内容增量（若提供） |
| `tool-call-start` | 工具调用开始 |
| `tool-call-delta` | 工具参数增量 |
| `tool-call-end` | 工具调用参数完整 |
| `usage` | token 与费用 |
| `finish` | 结束原因 |
| `error` | 归一化错误 |

能力矩阵：

| 提供商 | 流式 | 工具调用 | 视觉 | 推理 | 本地 |
| --- | --- | --- | --- | --- | --- |
| OpenAI 兼容 | 必须 | 视模型 | 视模型 | 视模型 | 可选 |
| Anthropic | 必须 | 必须 | 必须 | 视模型 | 否 |
| Ollama | 必须 | 视模型 | 视模型 | 视模型 | 必须 |

规则：

- 模型不支持工具调用时，显式降级为“只读建议”模式，并提示用户。
- 对话模型默认按支持视觉处理：图片作为视觉内容直接发送，不因能力声明缺失或为 false 而丢弃；能力声明只用于设置页提示与错误说明。
- 不允许在未配置的情况下静默切换模型或提供商。
- API Key 随本地 Provider 配置明文保存；日志与事件中不记录密钥。
- 支持自定义 Base URL 与请求头，用于代理和自建服务。
- 超时、退避重试、速率限制与取消必须由 Provider 层统一处理。
- 仅对瞬时错误重试：指数退避 + 抖动，遵守 `Retry-After`；认证失败、参数错误与内容策略拒绝不重试。
- 分别设置连接、首字节与流空闲超时；取消通过 `AbortSignal` 传播，关闭流后不再发起工具调用。
- 速率限制按 provider/model 维度执行；并发请求数与排队上限可配置。
- token 优先使用 provider 返回的 usage；缺失时使用本地估算，并在 UI 标记为估算值。
- 模型回退只能由用户配置触发，禁止静默切换；发生回退必须记录事件。
- 上下文超限错误触发一次压缩后重试；仍失败则中止并提示。
- 流中断时保留已生成内容并标记未完成；重试不得重复已执行的工具调用。
- 错误统一映射为错误码，如 `PROVIDER_UNAUTHORIZED`、`PROVIDER_RATE_LIMITED`、`PROVIDER_TIMEOUT`。

#### 模型角色与图像模型

- 对话模型配置保持 Provider + `models` 结构；图像模型使用独立入口和配置列表，不混入对话 Provider 的模型列表。
- 会话与 Run 记录实际使用的 `providerId + modelId`；不得在未指定模型时静默使用默认模型。
- 图像模型未配置时，`generate_image` 工具不注册，Agent 不能生成图片，UI 引导用户去设置。
- 图像模型使用独立模板 JSON：`url`、可选 `headers`、`body`、`result` 与可选 `poll`；不假设固定厂商字段。
- 请求体模板使用 JSON 占位符 `{{model}}`、`{{prompt}}`、`{{size}}`、`{{image_url}}`、`{{image_urls}}`；无参考图时移除包含图片占位符的字段/数组项。
- `result.path/paths` 支持点号、数组下标与 `*` 通配符，例如 `data.0.url`、`data.*.b64_json`；编码支持 URL、Base64 与 binary。
- 同步接口直接解析响应；异步接口通过 `poll.path`、`id_path`、`status_path` 与 `result_path` 轮询，不在代码中猜任务地址；必须校验响应大小、下载超时与图片类型。
- 图像生成结果以图片内容与文件引用返回；对话模型不支持视觉时由提供商报错，宿主不静默丢弃。

### 4.2 上下文工程

上下文预算 = 模型窗口 - 预留输出 - 安全余量。预算不足时自动压缩，不中断任务。

上下文是核心成本，也是产品竞争力的一部分。所有上下文组装都必须以“完成当前任务所需的最少信息”为目标，不能因为实现简单就注入全量内容。

系统提示由宿主统一组装：身份与安全约束、工具使用规则、工作区规则与当前任务；提供商适配层只做格式转换，不允许各提供商各自实现一套。

系统提示保持稳定的静态前缀；平台、时间等动态上下文追加到最后一条用户消息，避免破坏 prompt cache。用户自定义提示词可追加，但与默认系统提示冲突时以默认提示为准；场景模式提示词按需追加。

技能库只在系统提示中说明“存在可用技能”，不注入完整目录；Agent 通过 `search_skills` / `read_skill` 按需检索与读取。

工具 schema 按当前模式与权限注入：计划模式只注入只读工具；MCP 工具只注入已启用且已连接的 Server。

低 token 约束：

- 只注入当前任务必要的信息；禁止把整个工作区、完整会话历史、重复静态规范或无差别工具清单塞进上下文。
- 优先传递路径、ID、摘要与 Artifact 引用；需要细节时再按需读取，不直接发送全文。
- 系统提示与工具 schema 保持精简且稳定；静态前缀与动态内容分离，避免破坏 prompt cache。
- 工具输出与文件内容默认截断；完整内容落 Artifact，摘要只保留路径、命令、错误码、决策与待办。
- 新功能必须评估 token 成本，并纳入验收；能降低 token 的方案优先，不得因新功能让同类任务 token 明显回退。
- 新增自动注入内容必须说明必要性，并提供关闭或按需加载路径。

分配顺序（从不可压缩到可压缩）：

1. 系统提示与工具 schema。
2. 工作区规则与激活的 Skill 说明。
3. 当前 Task 目标与验收标准。
4. 最近若干轮消息。
5. 会话摘要。
6. 工具结果与检索到的文件片段。

自动压缩触发：

- 每次调用模型前估算输入 token；预计超过输入预算 70% 时压缩。
- 工具结果落回后如果再次超限，立即压缩。
- 切换模型时按新窗口重新计算，必要时重新压缩。

压缩顺序：

1. 截断旧工具输出，完整内容落 Artifact，只保留摘要与引用。
2. 将较早轮次折叠为结构化摘要（目标、决策、已改文件、错误、待办），保留最近若干轮原文。
3. 丢弃非必要的旧图片与长文本，只保留文件引用；图片仍按视觉内容处理，不转成文本。
4. 仍超限时提示用户缩小任务或手动清理，不静默丢弃关键上下文。

不可压缩内容：

- 系统提示、工具 schema、当前 Task、最新用户消息、最近一轮工具结果。
- 文件路径、命令、错误码、审批结论必须原样保留在摘要中。

规则：

- 摘要由当前对话模型生成，写入 `context.compacted` 事件，记录压缩前后 token、策略与摘要引用。
- 压缩失败时降级为硬截断并提示用户，不能阻塞任务。
- 用户可手动执行 `/compact` 触发一次压缩。
- 工具输出超过阈值时截断，并把完整内容落为 Artifact，事件中保留引用。
- 优先按需读取文件，不把整个工作区或全部目录塞入上下文。
- `@` 在当前工作区内检索，标注路径与行号；普通文件引用只插入路径，图片引用读取内容并作为视觉内容发送。
- AI 输出文件默认放入元数据与文件引用；图片作为视觉内容发送，其他二进制内容只保留文件引用，由用户另存后用专业软件打开。
- 本地 PDF / Word / Excel / PPT / ZIP 在读取时抽取文本注入上下文，限制文件大小、条目数与解压后体积，防止解压炸弹。
- 扫描版 PDF 无文本层时明确提示，不编造内容。
- 图片输入受大小上限约束，超限时压缩或拒绝并提示。
- 工作区文件内容一律视为不可信数据，不得把其中的指令当作系统指令执行。
- 记忆只包括工作区规则与用户偏好，不做跨工作区隐式记忆；临时会话默认没有项目规则。

#### 工作区索引

- 文件索引持久化到 SQLite，启动时增量扫描，避免每次全量遍历。
- 尊重 `.gitignore` 与 `.ignore`；跳过 `.git`、`node_modules`、构建产物、超大文件与二进制文件。
- 文件监听做防抖，批量变更合并处理；索引失败时降级为按需读取，不阻塞启动。
- `@` 检索按路径、文件名与最近访问排序，结果标注 root 与路径；默认排除密钥与敏感目录。
- 索引只存本地，不做远程同步；删除或移动文件后增量更新。

#### 提示词行为约束

- **反幻觉**：不得编造数据、事实、引用、链接、文件名、命令或 API；信息只能来自用户、工具返回或可靠常识，不确定时明确说明。
- **工具诚实**：没有实际调用工具时不得声称已调用或已执行；工具失败时如实说明，不编造结果。
- **链接真实性**：只使用用户提供或工具返回的链接，不自行构造或猜测 URL。
- **文件生成自检**：生成或修改文件前核对需求，内容必须基于用户资料或已读取的原文；数据不全时先说明缺口，不用占位符凑数。
- **命令自检**：执行前确认平台、路径与参数；失败时依据真实错误调整，不假装成功。

### 4.3 工具系统与审批

工具定义必须包含：

| 字段 | 说明 |
| --- | --- |
| `name` | 全局唯一；内置工具 snake_case，MCP 工具使用 `mcp_<serverId>_<toolName>` 并净化到 `[a-zA-Z0-9_-]{1,64}` |
| `label` | 展示名，用于工具卡片与审批面板 |
| `description` | 给模型的能力说明 |
| `inputSchema` | zod 输入契约 |
| `outputSchema` | zod 输出契约 |
| `permission` | `read` / `write` / `execute` / `network` |
| `requiresApproval` | 是否默认需要审批 |
| `timeoutMs` | 超时时间 |
| `maxOutputBytes` | 输出上限，超出转 Artifact |
| `idempotent` | 是否可安全重试 |

工具清单：

| 工具 | 权限 | 默认审批 |
| --- | --- | --- |
| `read_file` | read | 否 |
| `list_dir` / `glob` | read | 否 |
| `grep` | read | 否 |
| `write_file` | write | 是 |
| `apply_patch` | write | 是 |
| `run_command` | execute | 是 |
| `ask_user` | read | 否（等待用户） |
| `search_skills` | read | 否（系统内部） |
| `read_skill` | read | 否（系统内部） |
| `checkpoint` | write | 否（系统内部） |
| `save_file` | write | 否（写入 `files`） |
| `save_word` / `save_excel` / `save_ppt` / `save_pdf` | write | 否（写入 `files`） |
| `search_images` / `search_videos` | network | 是 |
| `generate_image` | network | 是（计费操作） |

`save_*` 工具写入 `<userData>/files`，不触发工作区写审批，但必须记录 `file.created` 并受大小与类型限制。`save_file` 支持文本与 Base64 二进制内容；`save_word` / `save_pdf` 使用 Markdown，`save_ppt` 支持模板化版式。

本地二进制读取计划在 M3 接入：按 MIME 与扩展名选择专用读取器；图片作为视觉内容发送，可抽取文本的格式转文本，其他二进制只保存文件引用，原始内容不得直接进入上下文。

#### MCP 工具接入

- 启动时扫描 `<userData>/mcp/mcp.json`，校验 `mcpServers` 配置后按需启动 Server；文件变化后的下次 Run 会重新读取。
- Server 提供的工具以 `mcp_<serverId>_<toolName>` 命名注册，名称净化到 `[a-zA-Z0-9_-]{1,64}`，权限为 `execute`，始终审批。
- 工具注册后参与正常工具选择，Agent 不需要了解 MCP 协议；调用时按普通工具走审批与事件流。
- 只有已启用、已信任且已连接的 Server 工具会进入工具 schema；未启用或断开时从 schema 移除。
- 每个 Server 单独启用与信任，默认不自动启动、不自动信任；首次启用必须展示将执行的命令与环境变量。
- `autoStart` 控制是否随应用启动；关闭时在首次工具调用时按需启动，仍要求已启用与信任。
- 配置变更后刷新工具 schema，在下次模型调用时生效；已发出的工具调用不受影响。
- 进程崩溃按退避重启，连续失败标记不可用；配置删除后注销其工具。
- Server 不可用时调用返回 `MCP_SERVER_UNAVAILABLE`，不得在循环内无休止重试。
- 连接按 Server 缓存，设置空闲 TTL、失败负缓存与全局并发上限；连接/列举/调用分别设置超时。
- 工具名净化到 `[a-zA-Z0-9_-]{1,64}`，超长或重名时截断并附加短哈希，避免被模型接口拒绝。
- 调用取消通过 `AbortSignal` 合并传播；连接中断时丢弃缓存，下次调用重连。
- 单个 Server 最多列举固定数量的工具，异常分页不会无限拉取；单个 Server 失败不影响其他工具。
- 环境变量只注入配置声明的白名单；敏感值保存在本地 MCP 配置中。

配置示例：

```json
{
  "id": "filesystem",
  "name": "Filesystem",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed"],
  "env": {},
  "enabled": true,
  "autoStart": false
}
```

- `id` 必须与目录名一致；`transport` 支持 `stdio` 与 `http`。
- `stdio` 使用 `command` / `args` / `env`；`http` 使用 `url` / `headers`。
- `autoStart` 默认 `false`；首次启用必须由用户在扩展页确认。

执行顺序固定为：

1. 写入 `tool.requested`，记录完整输入。
2. 需要审批时写入 `approval.requested`，会话进入 `waiting_approval`。
3. 审批通过后执行；拒绝则写入结构化失败结果，交回 Agent。
4. 写入 `tool.completed` 或 `tool.failed`，大输出落为 Artifact 并在事件中保留引用。

- 工具调用默认串行；同一批只读工具可并行，写与执行工具必须串行；并行上限可配置。
- 同一批工具调用必须按顺序写入事件，结果按 `callId` 回填。

#### 工具结果归一化

- 所有工具结果统一为 `{ ok, output, files, sources, error }`，禁止把二进制直接塞回上下文。
- 文本超过阈值时截断，完整内容落 Artifact；图片、音视频与文件写入 `files` 并返回 fileId。
- MCP 的 `content` 数组统一转换：文本保留，image/audio/video 落盘，resource/blob 落盘，resource_link 保留链接，`isError` 转为结构化错误。
- 模型直接产出的文件同样由文件服务落盘并记录 `file.created`。
- 工具返回的 URL/document 来源单独保留，并在会话流中展示为参考来源。

#### 文件输出

- 工具生成或下载的文件统一由文件服务写入 `<userData>/files/<sessionId>/`，分配 fileId 并记录元数据。
- `save_file` 与 `save_word` / `save_excel` / `save_ppt` / `save_pdf` 生成的文件同样走文件服务，返回文件引用。
- 写入 `files` 目录属于宿主内部存储，不触发工作区写审批，但必须记录 `file.created` 并受大小与类型限制。
- 不把 `files` 目录加入工作区白名单；Agent 通过工具返回的文件引用访问，路径解析由宿主完成。
- 会话流展示文件卡片，只提供另存为；不内联预览或暴露任意路径。
- 另存为通过系统文件对话框选择目标目录，由用户确认后复制。
- AI 输出文件默认永久保留，不自动清理；用户可手动清理，删除会话时可选择清理关联文件。

#### 图像生成

- 文本模型通过 `generate_image` 工具调用独立配置的图像模型；用户也可以显式发起。
- 对话模型不支持工具调用时，用户仍可通过显式命令发起图像生成。
- 参数包含 prompt、size、count、referenceFileIds（图生图）与 seed；返回 fileId 列表、尺寸与用量。请求体与结果字段由独立图像配置决定。
- 结果写入 `<userData>/files`，会话流以图片卡片展示并支持另存为。
- 生成结果同时作为图片内容返回给对话模型，模型可基于结果继续修改。
- 未配置图像模型时不注册该工具，返回结构化提示并引导用户到设置。
- 图像生成按次计费，记录 `usage.recorded`（`modality: image`）；默认逐次审批，可配置预算与速率限制。
- 生成内容遵循服务商内容策略；文件视为不可信，不自动打开或执行。

审批策略：

- 审批策略按 Workspace 或 Session scope 设置：`ask`（默认）、`allowlist`、`auto`（仅显式开启，高风险）。
- 写文件与执行命令默认逐次审批；重复且已加入白名单的命令可自动通过。
- 网络访问与 MCP 调用始终审批，不做静默放行。
- 审批粒度：工具、命令、路径、域名；支持允许一次 / 允许本会话 / 允许工作区 / 拒绝，敏感目录只提供拒绝。
- 相同 scope 的重复请求可合并展示并批量批准；拒绝后同一 Run 内不再重复请求同一操作。
- 审批等待默认超时 5 分钟；超时按拒绝处理，写入 `approval.resolved`，工具失败后 Run 继续，不会自动同意。
- 审批面板必须展示工具名、完整参数、cwd、影响路径、实际 diff 或写入内容、环境变量变化与执行后影响。
- 所有决定写入 `approval.resolved`，包含 scope、decision 与 reason；自动放行同样留痕。

路径与命令安全：

- 允许路径 = Workspace root（Session RootGrant）；所有路径经 `realpath` 解析后必须落在其中。
- 访问未授权路径时在会话流内联展示授权卡：允许 / 拒绝；敏感目录不提供授权选项。
- RootGrant 按会话隔离，写入 scope 事件；撤销或会话结束后立即失效。
- 文件 root 只允许读写自身；只有目录 root 可以作为 `cwd` 或执行命令。
- 符号链接经 `realpath` 后重新校验，目标越界需重新授权或拒绝。
- 拒绝访问私钥、`.ssh`、浏览器配置、系统凭据目录等敏感位置。
- AI 命令必须在已授权目录内执行，`cwd` 必须来自目录 root；用户显式打开的终端可位于工作区，无工作区时为根目录；AI 命令环境变量做白名单清理，禁止继承无关密钥。
- 危险命令必须拦截：提权、关机/重启、格式化磁盘、`rm -rf` 根目录或通配符、`curl | sh`、fork 炸弹等；解释器 `-c` 内嵌命令递归检查。
- 内置终端由 node-pty 持有 PTY，支持多标签与进程组终止；macOS 支持 `Cmd+K` 清屏；用户终端默认 cwd 为当前工作区，无工作区时为文件系统根目录。
- AI 的 `run_command` 在独立终端标签中执行并展示输出，不启动外部终端程序；命令仍受审批、危险命令拦截、超时与输出上限约束。
- 关闭正在运行的终端必须二次确认；命令内不允许自行追加 `&` 或 `nohup`。
- 超时后终止整个进程树；Windows 使用 ConPTY，macOS/Linux 使用 PTY。
- 输出超过上限时截断并标记；默认上限可配置，避免一次命令撑爆上下文。
- 打包后的 GUI 进程需要补齐 PATH，确保能找到 `node`、`npx`、`python` 等运行时。
- 工作区文件写入前必须展示 diff，并创建逐文件检查点；写入 `files` 内部存储不触发工作区写审批。

#### 无工作区会话

Session 可以不绑定 Workspace，也没有 Session RootGrant；这是合法状态，不得阻止发送消息或开始 Run。

- 空 scope 下 Run 仍可对话；Build 模式文件与命令工具仍注入 schema，首次本地调用时根据工具参数中的绝对目标路径在会话流内联请求目录授权；无绝对路径时返回 `TOOL_WORKSPACE_REQUIRED`；Plan 模式不自动请求授权，需用户先在会话头选择工作区。
- 用户授权目录后写入 Session RootGrant，并在同一次 Run 内继续执行；取消或授权失败则返回 `TOOL_WORKSPACE_REQUIRED`，不得静默扩大 scope。
- 不注入工作区索引、项目规则或文件上下文；只使用对话内容、技能元信息与用户显式输入。
- 同一 Run 内用户拒绝后不再重复请求；后续本地调用直接返回 `TOOL_WORKSPACE_REQUIRED`。
- 用户主动新增 root 或绑定工作区后，从下一次 Run 起按新 scope 注入工具；工具内授权只对当前 Run 生效。
- UI 显示「未选择工作区」，选择工作区是可选动作；发送条件只要求会话、Provider 与模型有效。
- 未授权前 `workspaceId`、RootGrant 与检查点保持为空；授权成功后写入 `scope.granted` 并同步刷新会话 root。

### 4.4 技能系统

`SKILL.md` 采用 frontmatter + 正文说明：

```text
---
name: fix-failing-tests
description: 当测试、类型检查或 lint 失败时使用，定位并修复直到全绿。
tags: [测试, lint, 类型错误]
version: 1.0.0
requires: [read, write, execute]
---
正文：触发条件、执行步骤、约束、验收标准。
```

检测与索引：

- 启动时扫描 `<userData>/skills/<id>/SKILL.md`，目录增删改时重新扫描。
- 只解析 frontmatter（name、description、tags、version、requires），正文不预加载。
- 无效 Skill 记录错误并跳过，不影响启动与其他技能。
- 输入 `/` 时列出可用技能；UI 展示已激活标签。

调用方式：

- **检索**：Agent 调用 `search_skills(query)`，返回最多 8 条元信息，按名称、标签、描述加权排序；ASCII 标签按整词匹配。
- **读取**：Agent 调用 `read_skill(name)` 读取完整正文，写入 `skill.activated` 事件；同一上下文重复读取返回“已激活”，不重复注入；上下文压缩或新 Run 后可按需重新读取。
- **显式调用**：输入 `/skill-name` 时绕过检索，直接读取并激活；显式调用优先于自动选择。
- Agent 在专业任务前应先检索技能；简单常识问题不必检索。
- 同时激活数量设上限，用户可随时移除已激活技能。

规则：

- Skill 不携带额外权限，脚本只能通过 `run_command` 执行并经过审批。
- Skill 变更必须同步更新说明与版本号，并补对应测试。

### 4.5 插件体系

**契约先行**：插件宿主可以后实现，但底层契约必须随功能提前埋好，否则后期会大面积返工。

- 所有领域动作从第一天就写入事件流，payload 定义在 `packages/shared`。
- 所有可扩展区域从第一天就通过标准插槽挂载，即使暂时没有插件加载。
- 所有能力调用从第一天就经过权限网关，不能等插件系统再补。
- 贡献点注册表与 manifest schema 先于宿主实现定义，接口只增不改。
- 新功能完成时必须回答：是否产生事件、是否暴露插槽/钩子、是否经过权限网关。

#### 4.5.1 模型

- 插件是用户目录下的本地 JS 模块，同进程加载：主进程入口提供逻辑，渲染进程入口提供 UI，能力由 manifest 权限约束。
- 运行时目录固定为 `<userData>/plugins/<plugin-id>/`；内置插件启动时从安装目录同步到这里，加载时与外部插件完全同权。
- 非核心产品能力默认以内置插件形式提供，便于按用户或版本启用、禁用与替换；只有不可插拔的核心契约才留在宿主。
- 启动时扫描该目录、校验 manifest 并注册；目录增删改时重新扫描并热重载。
- 插件 id 使用反向域名，版本遵循 semver。
- 插件不需要声明对宿主的依赖；入口直接导出 `activate(ctx)`，运行时由宿主注入能力。运行时依赖必须随插件打包，不得依赖内部包、Electron 或 Node 原生模块。

#### 4.5.2 目录与加载

插件由作者自行构建，宿主不参与构建：

```text
<userData>/plugins/<id>/
├─ plugin.json          # manifest，加载前用 zod 校验
├─ dist/
│  ├─ main.cjs          # 主进程入口，CommonJS（可选）
│  └─ renderer.mjs      # 渲染进程入口，ESM（可选）
└─ ...                  # 插件自带资源
```

- `main` 入口由主进程用 `require` 加载；`renderer` 入口通过宿主注册的 `nexus-plugin://` 协议动态 `import`。
- 仓库内置插件放在 `apps/desktop/resources/plugins/<id>/`；打包后进入应用 `resources/plugins`。启动时同步到 `<userData>/plugins`，内置副本由应用覆盖，启用状态仍由用户数据库控制。
- 两侧入口统一导出 `activate(ctx)`，可选导出 `deactivate()`。插件作者可复制 `packages/shared/src/plugin-api.d.ts` 获得类型提示，该文件只提供类型，不引入运行时依赖。
- 主进程入口等同于受信本地代码，运行在宿主主进程；扩展页显示“主进程代码”标记，只有用户启用后才加载。
- 入口路径经 `realpath` 校验，必须位于插件目录内，禁止路径穿越。
- 渲染进程插件自包含：可以自带 UI 框架，宿主只提供隔离容器、语义 token 与 `ctx`。
- 宿主为插件视图、消息插槽与输入区插槽提供 Shadow DOM 容器，避免样式污染；主题通过 CSS 变量继承。
- 全局皮肤由 manifest 声明贡献点，插件 renderer 入口通过 `ctx.skins.register` 在宿主提供的隔离层内绘制；插件不得直接注入全局 CSS。
- 插件不得写入自身目录，持久化统一使用 `ctx.storage`。
- 宿主监听 `<userData>/plugins`，新增、删除、修改后做防抖处理，再卸载或重载对应插件。

#### 4.5.3 manifest

```json
{
  "id": "nexus.token-usage",
  "name": "Token 用量",
  "version": "1.0.0",
  "engines": { "nexus": "^0.1.0" },
  "main": "dist/main.cjs",
  "renderer": "dist/renderer.mjs",
  "activationEvents": ["onView:usage.panel", "onSlot:usage.inline", "onEvent:usage.recorded"],
  "permissions": ["storage", "events:usage.recorded", "ui.panel", "ui.slot", "ui.statusbar", "ui.command"],
  "contributes": {
    "views": [{ "id": "usage.panel", "title": "用量", "location": "sidebar" }],
    "messageSlots": [{ "id": "usage.inline", "location": "message.assistant.footer" }],
    "statusBar": [{ "id": "usage.status", "align": "right" }],
    "commands": [{ "id": "usage.reset", "title": "重置统计" }],
    "settings": [
      { "key": "usage.currency", "type": "string", "default": "USD" }
    ]
  }
}
```

- `id` 必须全局唯一。
- `engines.nexus` 声明兼容的宿主版本范围。
- `activationEvents` 必须按需激活，禁止无条件在启动时加载所有插件。
- 权限必须最小化；未声明的能力调用会被宿主拒绝并记录日志。

#### 4.5.4 贡献点

| 贡献点 | 用途 |
| --- | --- |
| `views` | 侧栏、主区、底部面板 |
| `messageSlots` | 会话流、输入区、工具调用与审批等插槽 |
| `statusBar` | 状态栏条目 |
| `commands` | 命令面板与快捷键绑定 |
| `menus` | 上下文菜单、工具栏 |
| `settings` | 插件设置项 |
| `skins` | 全局皮肤：插件代码绘制的背景、遮罩与强调色 |
| `tools` | 向 Agent 注册工具（不开放） |
| `themes` | 后续开放，需单独评审 |

标准插槽：

| 区域 | 插槽 | 用途 |
| --- | --- | --- |
| 全局 | `sidebar.header` / `sidebar.footer` | 侧栏顶部/底部 |
| 全局 | `statusbar.left` / `statusbar.right` | 状态栏左右区域 |
| 输入区 | `composer.toolbar` / `composer.above` / `composer.footer` | 工具条、输入框上方提示、下方用量 |
| 空状态 | `empty-state` | 首次进入或无会话 |
| 会话 | `session.header.actions` | 会话头操作 |
| 会话 | `session.item.actions` | 会话列表项操作 |
| 消息 | `message.assistant.header` / `.footer` / `.actions` | AI 消息头、尾部、操作 |
| 消息 | `message.user.footer` / `.actions` | 用户消息尾、操作 |
| 工具 | `toolcall.body` / `toolcall.footer` | 工具调用内容与尾部 |
| 工作区 | `terminal.toolbar` | 终端工具条 |
| 文件 | `filecard.actions` / `filecard.footer` | 输出文件卡片 |

插件只能渲染在宿主给定的容器内，不得改变布局或遮挡宿主操作。

导出格式、首次启动引导等扩展点需要执行逻辑或影响主流程，当前不开放；后续以 `exporters`、`onboarding` 贡献点单独评审。

#### 事件钩子

- `ctx.events.on(event, handler)` 是插件订阅宿主事件的统一方式；payload 由 `packages/shared` 定义。
- 可用于 session、message、tool、approval、usage、file、context、mcp 等领域事件。
- 事件钩子是只读观察，不得修改、拦截或替代审批；需要拦截的能力必须单独评审并提升权限。
- 高频事件 `message.delta` 默认不暴露；使用 `message.completed`、`usage.recorded` 等聚合事件。
- 订阅必须返回 `Disposable`，插件停用时释放；`onEvent:<event>` 可按需激活。

#### 4.5.5 宿主 API

宿主注入的 `ctx` 是插件唯一对外 API，所有能力经权限网关：

```ts
ctx.commands.register(id: string, handler: () => void | Promise<void>): Disposable;
ctx.views.register(id: string, mount: (el: HTMLElement, ctx: PluginContext) => () => void): Disposable;
ctx.slots.register(id: string, mount: (el: HTMLElement, context: SlotContext) => () => void): Disposable;
ctx.skins.register(id: string, mount: (el: HTMLElement, ctx: PluginContext) => () => void): Disposable;
ctx.statusBar.add(item: StatusBarItem): Disposable;
ctx.events.on(event: NexusEventName, handler: (payload: unknown) => void): Disposable;
ctx.storage.get<T>(key: string): Promise<T | undefined>;
ctx.storage.set<T>(key: string, value: T): Promise<void>;
ctx.storage.delete(key: string): Promise<void>;
ctx.settings: Record<string, string | number | boolean | null>;
ctx.logger.info(message: string, meta?: unknown): void;
ctx.notifications.show(message: string, level?: 'info' | 'warning' | 'error'): void;
ctx.workspace.readFile(path: string): Promise<string>;
ctx.workspace.list(dir: string): Promise<WorkspaceEntry[]>;
```

```ts
/**
 * 插槽上下文，按 location 提供只读的会话/消息/工具/文件/用量信息
 */
interface SlotContext {
  location: string;
  sessionId: string;
  runId?: string;
  messageId?: string;
  role?: 'user' | 'assistant';
  toolCallId?: string;
  approvalId?: string;
  fileId?: string;
  usage?: UsageSummary;
  model?: string;
}
```

- 每个注册接口返回 `Disposable`，插件被禁用或卸载时必须释放全部资源。
- `ctx.storage` 与 `ctx.settings` 按插件 id 隔离，禁止跨插件读取。
- `ctx.views.register`、`ctx.slots.register` 与 `ctx.skins.register` 的 mount 函数必须返回清理函数；宿主负责容器与生命周期。
- 消息插槽固定渲染在宿主指定位置，插件不得改变布局、遮挡操作或劫持点击。
- 插槽顺序、尺寸与间距由宿主决定；插件只负责容器内部内容，不得影响宿主其他区域。
- 插件插槽只能补充信息，不得替代或隐藏宿主的命令、路径、审批与错误等安全信息。
- `SlotContext.usage` 为该条消息对应的用量汇总（跨该消息的模型步骤聚合）；缺失时插件可订阅 `usage.recorded` 自行累计。
- `skins` 由 manifest 声明，插件代码自行决定使用图片、canvas、WebGL 或 DOM；宿主在固定隔离层内挂载，皮肤切换、插件停用或热重载时调用清理函数。插件不得直接注入全局 CSS，也不得访问隔离层外的宿主 DOM。
- 渲染进程插件在 Shadow DOM 容器内挂载，UI 框架由插件自带，不得访问宿主 DOM 或全局状态。
- 事件 payload 类型由 SDK 导出，禁止插件假设未声明字段存在。
- 主进程侧事件由宿主按权限转发给渲染进程插件，插件不得自行跨进程通信。
- 主进程侧与渲染进程侧插件使用同一套权限语义；两侧都不得绕过宿主直接访问文件系统或网络。

#### 4.5.6 生命周期与容错

```text
目录扫描 -> manifest 校验 -> 版本兼容检查 -> 权限登记 -> 按需 activate(ctx)
        -> 挂载贡献点 -> 使用 -> 停用/删除 -> deactivate() -> 清理
```

- 无效 manifest 或入口缺失时，在扩展页展示错误并跳过，不影响宿主启动。
- 激活事件支持 `onView:<id>`、`onSlot:<slotId>`、`onCommand:<id>` 与 `onEvent:<event>`；消息插槽首次渲染时激活对应插件。
- 激活失败必须捕获并记录，自动禁用该插件，不得影响宿主启动。
- 插件回调抛出的异常由宿主包裹捕获，转为通知与日志。
- 目录文件变更做防抖处理，先 `deactivate()` 旧实例，再加载新实例。
- 目录删除时停用插件并清理其贡献点；启用/禁用状态需要持久化。
- 禁用或卸载插件前必须调用 `deactivate()`，并清理其贡献点与存储索引；卸载用户插件时删除插件目录与本地存储，内置插件只允许禁用。
- 扩展页支持编辑 `contributes.settings`，设置写入按插件隔离的存储；插件可以卸载用户插件，但不能卸载内置插件。

#### 4.5.7 内置插件参考

`apps/desktop/resources/plugins/nexus.token-usage` 是插件开发的参考实现，随应用同步到 `<userData>/plugins`，必须持续保持可运行，并演示：

- 通过 `messageSlots` 在会话标题栏和每条 AI 回复尾部分别显示会话与消息 token 用量。
- 通过只读 `SlotContext.usage` 读取宿主投影的用量，不自行累计跨会话总量。
- 不修改宿主布局，只在插槽内补充文本。
- 正确处理启用、禁用、热重载。

`apps/desktop/resources/plugins/nexus.theme-background` 是全局皮肤参考实现，演示插件代码用语义色绘制渐变背景；皮肤只声明贡献点，具体视觉完全由插件 renderer 决定。

```json
{
  "permissions": ["ui.skin"],
  "contributes": {
    "skins": [{ "id": "paper", "title": "纸张" }]
  }
}
```

```js
export function activate(ctx) {
  return ctx.skins.register('paper', (element) => {
    const canvas = document.createElement('canvas');
    element.appendChild(canvas);
    return () => canvas.remove();
  });
}
```

#### 4.5.8 开发与安装

- 类型：从 `packages/shared/src/plugin-api.d.ts` 复制 `PluginContext` 等声明获得类型提示，无需安装额外包。
- 开发：参考 `apps/desktop/resources/plugins/` 下任一内置插件，在 `<userData>/plugins/<id>` 新建 manifest 与入口，自行构建到 `dist/`。
- 安装：扩展页提供“导入插件文件夹”，选择包含 `plugin.json` 的目录，校验 manifest 与入口后复制到 `<userData>/plugins/<id>`；也可手动放置目录。不需要 `npm install`，也不需要用户执行构建命令。
- 宿主启动或目录变化时自动发现；导入后默认禁用，在扩展页确认权限并启用后激活。
- 调试：渲染进程插件使用 DevTools；主进程日志写入 `<userData>/logs`；目录变更触发热重载。
- 分发：压缩插件目录，用户解压到 `<userData>/plugins` 即可；在线市场与自动下载后续再设计。

### 4.6 持久化与事件 Schema

存储位置统一在 `app.getPath('userData')` 下：

```text
<userData>/
├─ nexus.db              # SQLite 主库
├─ plugins/<plugin-id>/  # 用户插件目录，启动时扫描
├─ skills/<skill-id>/    # 技能目录，启动时扫描
├─ mcp/mcp.json         # 标准 MCP 配置，启动时扫描
├─ settings/             # 启动设置（主题等，后续迁移到 settings 表）
├─ files/                # AI 输出文件与会话导出，按会话存放
├─ artifacts/            # 工具产物与完整日志
├─ checkpoints/          # 逐文件快照，按会话/检查点存放
└─ logs/                 # 运行日志
```

数据库表：

| 表 | 用途 |
| --- | --- |
| `workspaces` | 工作区与信任状态 |
| `workspace_roots` | 工作区目录 |
| `sessions` | 会话元数据与投影状态，工作区可选 |
| `session_roots` | 会话工作区授权 |
| `session_message_search` | 跨会话消息全文索引（FTS5 trigram） |
| `workspace_files` | 工作区文件索引（路径、mtime、size、hash） |
| `events` | append-only 事件流 |
| `checkpoints` | 逐文件快照索引 |
| `usage` | token、缓存、reasoning 与费用明细 |
| `settings` | 应用、工作区与会话设置 |
| `plugins` | 插件启用状态、权限确认与错误信息 |
| `mcp_servers` | MCP Server 启用、信任与最近状态 |
| `files` | AI 输出文件与会话导出元数据、存储路径 |
| `artifacts` | 工具产物索引：会话、Run、标签、路径、大小与类型 |
| `plugin_storage` | 按插件隔离的键值存储 |

规则：

- 所有运行期文件只写在 `<userData>` 下，不写入应用安装目录。
- 启动时创建缺失的 `plugins`、`skills`、`mcp`、`settings`、`files`、`artifacts`、`checkpoints`、`logs` 目录。
- 插件、技能、MCP 目录由用户维护，应用只读取；启用/禁用等状态写数据库。
- 文件系统是扩展的唯一事实来源，数据库只保存投影状态，启动时以扫描结果为准。
- 唯一 RootGrant 以 `session_roots` 持久化；会话删除时清理授权记录，不删除用户文件。
- 检查点把改动文件复制到 `<userData>/checkpoints/<sessionId>/<checkpointId>/`；恢复时按文件覆盖并先展示 diff。
- AI 输出文件只写入 `<userData>/files`，元数据写 `files` 表；文件通过 fileId 访问，不暴露任意路径。
- 搜索索引随 `message.completed` 增量更新，结果中的会话标题实时从 `sessions` 读取；删除会话时清理索引，短关键词或 FTS5 不可用时降级为 LIKE。
- 会话导出写入 `<userData>/files/exports`，通过文件服务分配 fileId；最终保存路径由用户选择。
- 另存为通过系统文件对话框选择目标目录，用户确认后复制；不自动写入工作区。
- AI 输出文件默认永久保留，不自动清理；用户可手动清理，删除会话时可选择清理关联文件。
- 事件表只插入，不更新、不删除；UI 状态由事件投影得出。
- 事件带 `version` 字段；schema 变更必须提供 upcaster 与迁移脚本。
- 启动时先校验数据库版本，再执行迁移；迁移失败必须提示并拒绝写入，不能带着旧 schema 运行。
- Artifact 落盘后事件只保存路径与摘要，避免数据库膨胀。
- SQLite 使用 WAL；启动时做完整性检查，损坏时进入只读恢复模式并提示导出。
- 单实例锁，禁止两个进程同时写同一个 `userData`。
- 迁移前自动备份数据库；迁移失败保留备份并拒绝启动写入。
- 数据保留：events 随会话保留；AI 输出文件默认永久保留、不自动清理；artifacts/checkpoints/logs/usage 可设保留期与磁盘配额；清理不得删除仍被引用的文件。
- 设置中的“清理缓存”只清 `files`、`artifacts`、`logs` 与浏览器 HTTP 缓存；会话、事件、检查点和工作区文件必须保留。
- 每条 Usage 记录 provider、model、输入与输出 token、缓存读写、reasoning token、步数、状态与耗时。
- 日志轮转，避免无限增长。
- API Key 随本地 Provider 配置保存，不写入事件流。
- 支持导出/导入会话事件、Artifact 与输出文件引用，用于问题复现与迁移；导出默认脱敏。

### 4.7 安全威胁模型

| 威胁 | 入口 | 缓解 |
| --- | --- | --- |
| 提示词注入 | 工作区文件、工具输出、网页内容 | 内容视为不可信数据，明确分隔；不执行其中指令；高风险动作审批 |
| 命令注入 | 模型生成的命令 | 展示完整命令、白名单、路径限制、环境变量清理 |
| 路径穿越 | 文件工具参数 | `realpath` 校验、Workspace root + Session RootGrant 限制、敏感目录拒绝 |
| 临时授权提权 | 未授权路径访问 | 允许一次/本会话、敏感目录不可授权、授权事件审计 |
| 符号链接逃逸 | 文件路径 | `realpath` 后重新校验，目标越界需重新授权或拒绝 |
| 会话授权泄漏 | RootGrant | 按会话隔离，不跨会话继承，撤销后立即失效 |
| 密钥泄露 | 日志、事件、导出 | 日志脱敏、配置仅保存在本机、事件不记录密钥 |
| 用户安装插件 | 插件代码 | 加载前校验 manifest 与入口路径、权限清单、能力网关、异常隔离；渲染层插件加载前移除 `window.nexus` |
| 恶意皮肤代码 | 插件 `skins` | 固定隔离层挂载、禁止访问宿主 DOM、不接受全局 CSS、切换时清理 |
| 插件目录篡改 | `<userData>/plugins` | 入口 `realpath` 限制、权限网关、事件审计 |
| MCP 服务不可信 | 外部 MCP Server | 逐服务启用与信任、工具命名空间隔离、默认不自动启动 |
| 渲染层 XSS | Markdown、插件 UI | 禁用原始 HTML、CSP、输出转义、不向渲染层暴露 Node |
| 不可信输出文件 | 下载或生成的文件 | 限制大小与类型、不内联预览、不自动打开或执行 |
| 图像生成滥用 | `generate_image` | 内容策略、逐次审批、预算与速率限制 |
| 文件路径泄露 | 文件访问/另存为 | 仅通过 fileId 访问 `<userData>/files`，不暴露任意路径 |
| SSRF | 图像、MCP HTTP | DNS 解析后拒绝私网/回环/元数据地址，限制重定向与响应大小 |
| 供应链风险 | 依赖包 | 锁定版本、最小依赖、依赖变更评审 |

信任模型：

- 工作区首次打开必须确认信任级别；未信任工作区默认拒绝写入与命令。
- 临时会话的每个 root 首次使用时授权；拒绝后不重复请求同一路径。
- RootGrant 按会话隔离且每个会话最多一个，撤销或会话结束后立即失效。
- 安装插件等同于运行本地代码：扩展页必须显示来源目录、版本与权限，默认不自动启用高权限能力。
- MCP 配置可以执行任意命令：首次启用必须展示完整命令与环境变量，敏感值保存在本地配置中。
- 技能脚本只能通过 `run_command` 执行，并经过审批。
- 审批策略是安全边界的一部分，不能只靠 UI 隐藏按钮。
- 模型输出永远不可直接执行，必须经过工具层与审批层。

### 4.7.1 网络策略

- 默认拒绝所有出站网络；按 provider、域名、端口显式放行。
- 图像生成、媒体搜索与 MCP HTTP 分别配置域名白名单；`localhost` 也需要显式允许。
- URL 经 DNS 解析后拒绝私网、回环、链路本地与云元数据地址；重定向每跳重新校验并限制次数。
- 网络响应设置大小与超时上限；大文件流式写入 `files`，不整体载入内存。
- 用户配置的 Base URL、图像模板与 MCP HTTP 地址同样做 SSRF 校验。
- 代理与自定义证书在设置中配置；不得绕过系统代理策略。
- 每次网络请求记录目标域名、耗时与结果状态，不记录敏感 header。

### 4.8 设置与配置

- 设置分三个层级，优先级为 **Session > Workspace > App**；读取时逐层合并，写入时记录 scope。
- 设置分类：通用、模型与提供商、终端、外观、缓存、权限与审批、快捷键、高级；终端设置包含 shell、字号、滚回、选中即复制与 WebGL；字体使用默认等宽字体，默认字号 12px，自动检测的 shell 路径需回显。
- 模型与提供商：对话 Provider 保持 Base URL、API Key、模型名、能力声明、上下文窗口、token 价格、`extra_params` 与自定义 headers；图像模型在独立入口配置完整请求 URL、模型、Key、headers、请求体模板与结果路径；媒体搜索在通用设置中配置 Pexels API Key。
- 支持连接测试与模型列表刷新；API Key 随本地 Provider 配置保存；不写死默认模型。
- 图像模型可选；未配置时不注册 `generate_image`，设置页提供引导。
- 权限与审批：默认审批策略、命令白名单、敏感路径策略、工作区信任管理。
- 外观：`light / dark / system` 三态，默认 `system`；同时支持字号、密度与减少动效跟随系统。
- 通用：开机自启默认开启，可在设置中关闭；开发态不注册系统登录项，打包后通过系统登录项生效。启动时以系统登录项实际状态为准回写偏好，避免覆盖用户在系统中做的修改。
- 缓存：统计并清理 AI 输出文件、工具产物、运行日志与 Electron HTTP 缓存；不得删除会话、事件、检查点或用户工作区文件。
- 有 Run 运行时禁止清理缓存；部分目录清理失败必须返回失败类别并提示用户，不得误报全部成功。
- 高级：数据目录、日志、遥测开关（默认关闭）。
- Extensions 弹窗独立管理插件、Skill、MCP，不混入设置；插件自身配置放在插件详情中。
- 设置项必须由 zod schema 定义，未知键忽略；变更写入 `settings.updated` 事件。
- 入口使用 `Cmd/Ctrl+,` 打开设置弹窗；macOS 与 Windows 使用同一套布局。

### 4.9 Agent 循环与运行控制

- 单次 Run 的循环固定为：构造上下文 → 调用模型 → 收集工具调用 → 执行工具 → 回填结果 → 继续，直到满足停止条件。
- 停止条件：模型不再调用工具、达到验收标准、用户取消、预算触发、连续无进展、验证反复失败。
- 预算项为 token、费用与墙钟时间；工具调用次数与步数只作为观测指标，不设默认硬上限。
- 用户可在设置中为单次 Run 配置可选的工具调用或步数硬上限，默认关闭。
- 多个 Session 可并行运行；全局并发 Run 数可配置，超出时排队并显示 `queued`，并优先遵守 provider 速率限制。
- 交互式 Run 触及预算时提示并允许继续；后台或无人值守 Run 触及预算时必须停止，并写入 `run.budget.exceeded`。
- 无进展检测：同一工具、同一参数重复调用、文件无变化或连续相同错误时，暂停并询问用户，而不是继续重试。
- 完成判定：模型停止调用工具且验证通过才算完成；验证反复失败时交回用户。
- Agent 模式分为 Plan 与 Build；Plan 只读，Build 执行，规则见 4.11。
- Agent 可通过 `ask_user` 请求澄清；等待用户时 Run 暂停，不继续执行工具（见 4.12）。
- 用户可随时取消；取消必须终止正在执行的工具进程树，写入 `run.cancelled`，保留已完成的部分结果。
- 瞬时错误按退避重试；不可重试错误中止并交回用户，禁止在循环内无限重试。
- 每次 Run 结束必须记录 `run.completed` / `run.failed` / `run.cancelled`，包含用量、工具调用次数与耗时。

### 4.10 会话生命周期与恢复

- 支持多会话：可同时打开多个会话标签，每个会话独立上下文、scope 与运行状态；切换标签不中断后台 Run。
- 启动、删除最后一个会话或清除全部后若会话数为 0，自动创建一个新会话；无会话空状态仅作为异常兜底。
- 会话支持创建、重命名、恢复、归档、删除与导出/导入。
- 会话标题：首条用户消息后异步生成简短 AI 摘要，默认以首条用户消息为主要依据；失败或无模型时截断首条消息。用户重命名后不再自动覆盖，`titleSource` 记录 `auto` / `user`。
- 会话支持置顶/取消置顶；列表按置顶、最近活跃排序，可按工作区分组。
- 会话列表支持跨会话搜索，规则见 4.10.1。
- 事件按 `seq` 单调递增；启动时从事件流重建投影，重复或缺失事件必须校验并告警。
- 重启后未完成的 Run 标记为 `interrupted`，用户可选择继续、重试或停止；不得静默继续执行工具。
- 删除会话时删除事件、投影与授权记录；用户可选择清理 `files`、`checkpoints`、`artifacts`，不删除工作区文件。
- 应用单实例；关闭窗口默认驻留托盘，运行中的 Run 继续；后台或无人值守 Run 必须有硬预算，退出应用时如有运行中 Run 必须确认。
- 当前使用单主窗口，会话以标签页切换；多窗口后续再设计。
- 崩溃恢复：启动时回放事件；未完成事务丢弃，恢复到最后一个一致状态并提示用户。

#### 4.10.1 跨会话搜索

- 搜索消息正文；结果展示所属会话标题、角色与命中片段。默认覆盖全部会话，可按工作区或时间过滤。
- 使用 SQLite FTS5 trigram 索引消息正文，随 `message.completed` 增量更新；短关键词或 FTS5 不可用时降级为 LIKE 查询。
- 搜索结果展示会话、时间与匹配片段；点击跳转到对应消息。
- 搜索默认排除密钥与敏感路径内容；已被 `superseded` 的消息不参与搜索，但事件仍保留。
- 索引只存本地，不参与远程同步。

#### 4.10.2 会话导出

- 支持 Markdown、HTML、PDF 三种格式。
- 导出内容包含会话元数据、消息、工具调用摘要、审批、diff 与用量；默认不含密钥，长工具输出可折叠或截断。
- Markdown 为可读文本；HTML 为自包含单文件；PDF 通过 `printToPDF` 生成。
- 导出文件由文件服务写入 `<userData>/files/exports`，用户通过系统文件对话框选择最终保存路径。
- 导出前展示内容范围与脱敏选项；导出完成后写入 `session.exported` 事件。

#### 4.10.3 消息操作与重新生成

- **编辑用户消息**：允许修改历史中的用户消息并重发；原消息、后续回复与工具调用保留在事件流中并标记 `superseded`，不物理删除。
- 编辑前展示受影响的后续消息、已执行工具与检查点；已有副作用时提示用户可能需要回滚。
- 重发会创建新的 Run，从编辑后的消息继续；旧 Run 保留可回看。
- **重新生成**：只对最后一条助手回复可用；基于当前上下文重新调用模型，不重放已完成的工具调用，旧回复标记 `superseded`。
- **停止回复**：中止流式输出，终止正在执行的工具进程树，保留已生成内容并标记未完成；不自动恢复文件，深度恢复交给外部工具。
- 所有操作写入 `message.edited`、`message.regenerated`、`message.superseded`、`run.cancelled` 等事件。
- UI 提供编辑、重发、重新生成与停止按钮；流式期间停止按钮始终可用。

#### 4.10.4 变更审批与外部审阅

- 文件写入与命令执行前必须展示路径、完整参数、cwd、实际 diff 或写入内容与影响范围。
- 审批必须由用户显式允许；拒绝后不得执行，并写入结构化失败结果。
- 深度代码审阅与版本回滚交给外部编辑器/Git，App 不提供独立审阅面板。
- 只读工具与 `files` 输出不进入写审批。

#### 4.10.5 通知与后台任务

- Run 完成、失败、等待审批或等待用户时，若窗口不在前台，发送系统通知。
- 托盘与 Dock 显示运行中数量或状态；Dock 徽标显示等待处理或失败数量。
- 终端面板由状态栏入口打开，默认宽度 600px、最大 720px 且保证对话区至少 420px并支持拖拽；标签支持拖拽排序、双击重命名、关闭、关闭其他、关闭右侧与恢复标题。
- 终端支持指定目录新建、当前目录新建、内容搜索、右键复制/粘贴/全选/清空、URL 与路径链接、拖入文件、`Cmd+K` 清屏；终端设置包含 shell、字体、字号、滚回与选中即复制。
- 终端有前台命令或后台子进程运行时，关闭前必须通过 popover 二次确认并终止其进程组；空闲 shell 直接关闭；终端固定深色，颜色取自应用深色调色板。
- 终端按窗口和会话归属；窗口销毁或会话删除时必须终止关联 PTY，避免孤儿进程。
- AI 在需要执行命令时创建终端标签，用户在面板中可见同一 PTY 输出；命令结束后同一标签切换为交互式 shell，用户可继续操作。
- 通知内容不包含密钥与敏感路径；点击通知跳转到对应会话。
- 后台或无人值守 Run 必须有硬预算（见 4.9）。

### 4.11 Agent 模式（Plan / Build）

- 每个 Session 有一个当前模式 `plan | build`，默认 `build`；未信任工作区默认 `plan`，确认信任后可切换。
- Plan 模式只读：允许 `read_file`、`list_dir`、`glob`、`grep`、`ask_user`、`search_skills`、`read_skill`。
- Plan 模式禁止所有有副作用的本地操作：不写文件、不执行命令、不联网、不启动 MCP、不创建检查点、不修改设置与授权。
- Plan 模式下 `write_file`、`apply_patch`、`run_command`、`checkpoint`、`generate_image` 与全部 MCP 工具均不可用。
- Plan 产出目标、步骤、涉及文件、风险与验收标准；用户确认后切换到 Build 执行。
- Build 模式按工具权限与审批策略执行全部允许的工具。
- 模式切换只能由用户操作，Agent 不能自行从 Plan 切到 Build。
- 输入区展示当前模式；模式变化写入 `session.mode.changed` 事件。
- 被模式禁用的工具调用返回 `TOOL_MODE_DENIED`，不得在循环内重试。

### 4.12 交互式提问（Ask User）

- `ask_user` 工具用于澄清需求、选择方案或确认下一步，不替代工具审批。
- 请求包含 1–4 个问题；每个问题有 id、问题文本与可选选项，无选项时为自由文本。
- 选项支持单选/多选、自定义输入（Other）与必答标记；选项 id 在请求内唯一。
- 选项数量控制在 2–9 个，适合键盘操作；推荐项通过描述标注，不伪造默认值。
- 用户取消时返回 `ASK_USER_CANCELLED`，Agent 可继续或停止，不得反复追问同一问题。
- 交互式会话中 Run 进入 `waiting_user`；后台或无人值守 Run 不可用，返回 `ASK_USER_UNAVAILABLE`。
- 提问与回答写入 `ask_user.requested` / `ask_user.resolved` 事件；重启后未回答的问题可恢复。
- 回答作为工具结果回填给 Agent，包含所选选项 id 与文本。
- UI 以会话流行内卡片展示，不使用模态框；支持键盘导航、数字键选择、Enter 提交、Esc 取消。
- Agent 只在存在阻塞性歧义或需要用户决策时提问；能合理假设时先执行，并在结果中说明。

```ts
/**
 * 结构化提问请求，ask_user 工具使用；questions 为 1–4 个问题
 */
interface AskQuestion {
  id: string;
  header?: string;
  question: string;
  options?: { id: string; label: string; description?: string }[];
  multiple?: boolean;
  allowOther?: boolean;
  required?: boolean;
}

/**
 * 用户回答，按 questionId 回填给 Agent
 */
interface AskUserAnswer {
  questionId: string;
  selectedOptionIds?: string[];
  text?: string;
}
```

---

## 5. 体验与设计规范

### 5.1 设计原则（Apple 对齐）

- **清晰（Clarity）**：界面只呈现当前任务需要的信息，默认态干净，细节按需展开。
- **克制（Deference）**：UI 让位于内容，禁止装饰性渐变、重阴影与彩色堆砌。
- **深度（Depth）**：用层级、材质与动效表达结构关系，不做无意义的动画。
- **键盘优先**：核心操作都可用快捷键完成；`Cmd/Ctrl+K` 打开命令面板；快捷键集中注册并可在设置中查看。
- **直接操作**：拖拽、内联编辑、就地 diff，避免为简单动作跳转新页面。
- **渐进披露**：低频高级选项折叠，主流程不出现无关配置。
- **审批融入心流**：工具审批以行内面板或浮层呈现，必须展示将要执行的内容与影响范围，不能做成打断式网页弹窗。
- **默认优于配置**：优先给出合理默认值，避免大面积设置页。
- **组件优先 Naive UI**：按钮、输入框、选择器、弹窗、提示、标签等基础控件优先使用 Naive UI；不得无理由重复造原生控件。
- 自定义组件只用于品牌化布局、消息流、diff 等 Naive UI 覆盖不到的区域，并必须补齐 hover / active / focus / disabled 状态。
- 禁止把裸原生控件作为最终界面；原生控件只能作为底层实现或无法覆盖时的例外，并统一主题与尺寸。

默认贴近 macOS 原生质感，保留自有品牌识别的演进空间；视觉方向调整必须评审并更新本文件。

### 5.2 语义 token 与主题

`renderer/styles/global.less` 定义尺寸、字体、动效等与主题无关的 token；`renderer/app/theme-palette.ts` 是颜色与 Naive UI 覆盖的唯一来源，运行时注入 CSS 变量，不得再维护第二套色板。以下为完整语义清单，颜色值仅作 light 主题示例：

```less
/**
 * 背景与表面
 */
--nh-color-bg-base: #ffffff;
--nh-color-bg-elevated: #f8fafc;
--nh-color-bg-modal: #ffffff;
--nh-color-bg-popover: #ffffff;
--nh-border-subtle: #e6ebf2;
--nh-input-bg: #ffffff;
--nh-color-bg-hover: #f1f6fc;
--nh-color-code-bg: #0b1220;
--nh-color-code-text: #dfe9f8;

/**
 * 文本
 */
--nh-color-text-primary: #111827;
--nh-color-text-secondary: #5b6472;
--nh-color-text-disabled: #9ca3af;

/**
 * 边框、强调、状态
 */
--nh-color-border: #e6ebf2;
--nh-color-accent: #3b82f6;
--nh-color-accent-hover: #2563eb;
--nh-color-accent-pressed: #1d4ed8;
--nh-color-idle: #6b63c9;
--nh-color-success: #15803d;
--nh-color-warning: #b45309;
--nh-color-danger: #b91c1c;

/**
 * 尺寸与动效
 */
--nh-radius-sm: 4px;
--nh-radius-md: 8px;
--nh-space-sm: 8px;
--nh-space-md: 16px;
--nh-shadow-card: 0 1px 2px rgb(28 27 25 / 4%), 0 8px 24px rgb(28 27 25 / 5%);
--nh-shadow-float: 0 2px 8px rgb(28 27 25 / 6%), 0 16px 48px rgb(28 27 25 / 8%);
--nh-shadow-popover: 0 8px 24px rgb(0 0 0 / 12%);
--nh-highlight: inset 0 1px 0 rgb(255 255 255 / 70%);
--nh-mask: #000;

/**
 * 字体与动效
 */
--nh-font-sans: -apple-system, "SF Pro Text", "Segoe UI Variable", "Segoe UI", sans-serif;
--nh-font-mono: "SF Mono", "Cascadia Code", ui-monospace, monospace;
--nh-duration-fast: 120ms;
--nh-duration-base: 200ms;
--nh-duration-panel: 240ms;
--nh-ease-standard: cubic-bezier(0.2, 0, 0, 1);
--nh-ease-emphasized: cubic-bezier(0.2, 0, 0, 1.2);
```

规则：

- 组件样式**禁止硬编码颜色**，只能使用 `var(--nh-*)`。
- 主题切换：`<html data-theme="light | dark">`，`theme` store 统一管理 `light / dark / system` 三态。
- `system` 模式监听系统主题变化并实时更新，选择结果持久化。
- 主进程监听 `nativeTheme`，窗口 `backgroundColor` 与 `--nh-color-bg-base` 同步；渲染进程在 `<html>` 设置 `data-theme` 与 `color-scheme`。
- Naive UI 的 `darkTheme` 与 `themeOverrides` 必须在根级 `NConfigProvider` 注入，Teleport 弹层不得依赖局部容器。
- 原生菜单与系统对话框跟随系统主题，不强行改色；自定义菜单使用语义 token。
- Naive UI 的 `themeOverrides` 必须由同一套语义 token 派生，禁止两套色板。
- Less 变量只用于断点、mixins、编译期计算；运行期主题必须用 CSS 变量。
- 每个组件样式加 `scoped`；仅布局根节点、主题定义允许全局选择器。
- 嵌套层级不超过 3 层；禁止 `!important`，除非覆盖第三方库且注释说明。
- 类名遵循 BEM，禁止无意义类名（`box1`、`red`）。
- 字体、动效、阴影、层级同样必须使用 token，禁止在组件内写 `transition: all 0.3s` 之类的魔法值。
- 尺寸、间距、字号、圆角与行高使用偶数（推荐 4 的倍数），禁止 `13px`、`15px`、`7px` 等奇数数值；`1px` 边框与发丝线例外，统一使用 border token。
- 平台材质与窗口差异统一收敛到 `platform/` 适配层，业务样式不得直接判断操作系统。

插件主题：

- 插件 UI 只允许使用 `--nh-*` 语义变量，禁止写死颜色与字体。
- 插件不得覆盖全局 token，只能读取；主题贡献点开放后需单独评审。

### 5.3 动效与质感

- 只使用动效 token：即时反馈 `--nh-duration-fast`，常规过渡 `--nh-duration-base`，面板进出 `--nh-duration-panel`。
- 动效只用于解释状态变化（出现、消失、层级迁移），不用于装饰或延迟用户操作。
- 必须尊重 `prefers-reduced-motion`，在该偏好下降级为无动画或纯淡入淡出。
- 滚动使用系统原生惯性；长列表必须虚拟化，避免布局抖动与整页重排。
- 材质与层级：macOS 使用半透明与背景模糊（vibrancy），Windows 使用 Mica 或纯色回退，均不得硬编码色值。

### 5.4 平台适配

- **macOS 为主**：隐藏式标题栏与原生红绿灯、原生菜单、Dock 行为、全屏、窗口状态记忆、系统文件对话框与拖放。
- **Windows 兼容**：遵循 Windows 窗口控件与字体习惯，使用 Mica 或纯色回退；不强行复制 macOS 控件。
- 字体优先系统栈（macOS `-apple-system` / SF Pro，Windows `Segoe UI Variable`），不把第三方字体作为默认。
- 平台差异集中封装在 `renderer/platform/` 与主进程 `app/` 层，业务组件不得散落 `process.platform` 判断。

### 5.5 性能预算

- 冷启动到可交互目标 < 1.5s（Apple Silicon 基准）；Windows 同档硬件不得明显劣化。
- 输入与滚动保持 60fps；单次主线程任务 < 16ms，重计算放入 Worker 或主进程。
- 终端、图表等重模块全部懒加载，首屏只加载当前界面。
- 列表超过 50 项必须虚拟化；流式消息采用增量更新，禁止整列表重渲染。
- 新增依赖必须评估包体积与启动开销，核心界面不引入重型 UI 依赖。
- token 属于产品预算：同等任务优先低 token 方案；新增提示词、工具 schema、自动注入上下文与默认工具输出必须有成本依据。
- 任何“为了省实现时间而多塞上下文”的做法都不接受；必要时先做按需读取、索引、摘要或 Artifact 引用。

### 5.6 无障碍与国际化

- 所有交互元素必须有可见焦点态与可读标签；图标按钮必须有 `aria-label`。
- 键盘可完成主要流程，不允许只能通过鼠标触发的关键操作。
- 文本与背景对比度至少满足 WCAG AA；支持系统字号放大。
- 动效遵循 `prefers-reduced-motion`。
- 所有用户可见文案走 i18n key，禁止硬编码在组件模板中；当前提供 `zh-CN` 与 `en-US`，语言选择持久化，并同时驱动 Naive UI 内置文案。

### 5.7 命令与快捷键

- 所有可触发操作通过统一命令注册表定义：id、标题、快捷键、启用条件、handler。
- 命令面板、菜单、快捷键与工具栏从同一注册表生成，禁止各自硬编码。
- 启动时检测快捷键冲突并提示；用户可覆盖默认绑定，结果持久化。
- 插件命令进入同一注册表，按权限过滤。
- 核心操作必须有默认快捷键，并在设置页可查看与修改。
- 会话新建、重命名、置顶、导出与跨会话搜索必须提供默认命令；全局搜索快捷键为 `Cmd/Ctrl+Shift+F`。
- 编辑重发、重新生成与停止回复必须可通过命令面板触发；流式期间停止始终可用。
- 命令执行必须有错误处理与禁用态，不允许静默失败。

---

## 6. 工程规范

### 6.1 组件拆分规范

- 一个文件只放一个组件，文件名与组件名一致，使用 PascalCase。
- 满足任意一条即必须拆分：
  - 单文件超过 **200 行**（不含模板中的简单标记）。
  - 同时承担 **3 个及以上职责**（数据获取、状态管理、展示、交互编排等）。
  - 出现可被第二个页面复用的 UI 或逻辑。
  - props 或 emits 超过 **6 个**，应改为组合子组件或使用插槽。
- 可复用逻辑必须提取到 `composables/`；可复用 UI 提取到 `components/`。
- 列表渲染必须有独立子组件（如 `MessageList.vue` + `MessageItem.vue`）。
- **展示组件**：只接收 props、只 emit 事件，不访问 store、不发起 IPC。
- **容器组件 / views**：负责取数、状态编排、权限与错误处理，把结果传给展示组件。
- 展示组件必须能在 Storybook 或测试中脱离应用独立渲染。

### 6.2 命名规范

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
- Vue 组件事件名使用 kebab-case，如 `update:modelValue`、`tool-call-expanded`。

### 6.3 注释规范

允许与禁止：

- 允许：`//` 单行注释、`/** ... */` 多行文档注释。
- **禁止**：`/* ... */` 单星块注释，无论行内还是独立成行。
- 文档注释必须使用换行块形式，禁止压缩成单行 `/** ... */`。
- 注释形式不强制统一；优先选择能清楚说明意图的形式。
- 禁止：注释掉的死代码；需要保留的实现请用 Git 历史或 `// TODO` 说明，不得整段注释。
- 禁止：与代码不一致的过期注释。改代码必须同步改注释。
- 禁止：无信息量的注释，如 `// 设置变量`、`// 循环数组`。

必须注释的位置：

- 每个文件顶部：用文档注释或单行注释说明文件职责、所属模块、关键约束。
- 每个导出的函数、方法、类型、接口、枚举、常量：上方用文档注释说明用途、参数含义、返回值、异常与副作用。
- 每个 store 的 state、getter、action。
- 每个 IPC handler、每个事件订阅与发布。
- 函数内部非显而易见的分支、正则、算法、兼容处理、性能取舍：用 `//` 说明**为什么**这样做，而不是重复代码在做什么。
- 模块级变量必须注释；函数内局部变量在语义不自明时必须注释。
- 复杂代码块（超过约 15 行的逻辑段）在起始处用 `//` 概括该段目的。

风格：

- 注释语言统一使用**中文**；专有名词、API 名、类型名保留英文。
- 文档注释用于“对外说明”，单行注释用于“对内解释”。
- 用 `TODO(负责人): 原因与计划`、`FIXME(负责人): 问题与影响` 标记待办，禁止裸 `TODO`。
- 注释不写变更日志，不写“新增”“修改”等历史信息。

示例：

```ts
/**
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

### 6.4 TypeScript 规范

- 开启 `strict`、`noUncheckedIndexedAccess`、`noImplicitOverride`、`exactOptionalPropertyTypes`。
- 禁止 `any`；无法确定时用 `unknown` 并在边界处收窄。确需逃逸时使用 `// eslint-disable-next-line` 并写明原因。
- 类型导入统一使用 `import type`。
- 对外数据结构优先用 `interface`，联合类型、映射类型用 `type`。
- 禁止非空断言 `!` 滥用；只在已通过校验且注释说明理由时使用。
- 所有跨进程输入、插件 manifest、配置文件必须经 zod 校验后再使用。
- 禁止用 `void` 抑制 Promise；异步调用必须显式 `await` 或 `.catch()` 处理错误。
- 枚举优先使用 `as const` 对象 + 联合类型，避免 TS `enum`。
- 公共函数必须有显式返回类型。

### 6.5 Vue / Pinia / 导航状态规范

Vue 单文件组件：

- 固定顺序：`<template>` → `<script setup lang="ts">` → `<style scoped lang="less">`。
- 组件名使用 PascalCase 多词命名，禁止单词组件名（如 `Button.vue` 应改为 `PrimaryButton.vue`）。
- `defineProps` / `defineEmits` 必须使用类型声明，默认值通过 `withDefaults`。
- 模板中禁止写复杂表达式，派生数据用 `computed`。
- `v-for` 必须使用稳定主键，禁止使用索引作为 key。
- 禁止在模板中直接调用 `window.nexus`，统一经 `api/` 封装。
- `v-if` 与 `v-for` 不同时用于同一元素。

Pinia：

- 一个模块一个 store，使用 setup 语法定义。
- 全局 store 仅限 `theme`、`app`、`layout`；业务状态放模块内 store。
- 禁止跨 store 直接修改对方 state，必须调用对方 action。
- 持久化统一走 `storage` 服务，禁止组件内直接使用 `localStorage`。
- action 内必须处理加载态与错误，禁止把异常静默吞掉。

导航与弹窗：

- 不引入 URL 路由；当前会话、surface、面板与弹窗状态由 Pinia 管理。
- 设置与扩展以弹窗展示；命令面板、通知与 IPC 只切换状态，不跳转路由。
- 深链接通过带 `sessionId` 的 IPC 激活窗口并切换会话。
- 终端、图表等重面板使用 `defineAsyncComponent` 懒加载。
- 禁止在组件内维护独立导航状态或硬编码视图字符串。

Composables：

- 命名 `useXxx`，返回对象或元组，禁止返回含义不明的数组。
- 内部副作用（定时器、监听器、订阅）必须在 `onScopeDispose` 或 `onUnmounted` 中清理。
- 异步 composable 必须暴露 `loading`、`error`、`data` 三态。

### 6.6 IPC 与进程边界

- 主窗口必须开启 `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`。
- preload 只通过 `contextBridge` 暴露 `window.nexus`，按命名空间组织：`nexus.agent`、`nexus.terminal`、`nexus.session`、`nexus.workspace`、`nexus.files`、`nexus.artifact`、`nexus.search`、`nexus.plugin`、`nexus.settings`。
- 会话重命名、置顶、导出与跨会话搜索必须走 `nexus.session` / `nexus.search` 的类型化方法。
- 工作区绑定、root 授权与撤销必须走 `nexus.workspace` / `nexus.session` 的类型化方法，渲染层不得直接拼接路径或修改授权状态。
- `nexus.files` 提供另存为，禁止渲染层直接拼接 `files` 路径。
- 通道常量与 zod schema 统一定义在 `packages/shared`，主进程与 preload 共用。
- 主进程在处理前必须 `schema.parse`，禁止信任渲染进程输入。
- 统一返回结构：

```ts
type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };
```

- 流式数据使用 IPC 事件通道，命名 `domain:event`（如 `agent:event`）；它只负责跨进程推送，持久化领域事件仍使用 `domain.action`。订阅必须返回取消函数，组件卸载时调用。
- 错误码使用大写下划线形式，如 `TOOL_PERMISSION_DENIED`、`PROVIDER_UNAUTHORIZED`。
- 权限校验、路径白名单、命令拦截必须在主进程服务层完成，不能只靠 UI 限制。
- 渲染进程不得直接调用 `ipcRenderer`，只能使用 preload 暴露的类型化方法。

### 6.7 错误处理与日志

- 禁止空 `catch`；必须处理、转换或重新抛出并附加上下文。
- 用户可见错误必须包含可操作信息，不得直接暴露堆栈。
- 预期内错误用 `Result` 返回；真正异常才 `throw`，并在边界统一转换。
- 日志分级 `debug / info / warn / error`，包含模块名与关键上下文字段。
- 禁止在日志中输出 API Key、完整请求头、用户隐私路径内容。
- 主进程未捕获异常必须接入统一处理器并提示用户重启。

错误分类：

| 类别 | 示例 | 处理 |
| --- | --- | --- |
| Provider | 401、429、超时、上下文超限 | 引导设置、退避重试、压缩后重试 |
| Tool | 权限拒绝、超时、非零退出 | 展示命令与输出，允许重试或跳过 |
| Workspace | 路径未授权、IO 错误 | 请求授权、提示检查权限 |
| Extension | 插件或 MCP 加载失败 | 禁用条目并展示错误 |
| Internal | 未捕获异常 | 记录日志、提示重启、导出诊断 |

- 仅瞬时错误自动重试，其余错误交回 Agent 或用户。
- 支持导出诊断包：脱敏日志、配置摘要与事件引用；不包含密钥与用户文件内容。

### 6.8 可观测性

- 日志使用结构化格式，字段至少包含 `module`、`sessionId`、`runId`、`toolCallId`（如适用）。
- 用量与费用必须落 `usage.recorded` 事件，支持按会话、模型、提供商聚合；包含缓存读写、reasoning token、步数、状态与耗时。
- 工具结果记录类型、落盘文件与来源引用，不记录二进制内容与敏感数据。
- MCP 记录连接状态、工具数量、重连与失败次数，便于定位不可用 Server。
- 关键路径（启动、工具执行、模型调用、上下文压缩、回滚）记录耗时，用于性能回归。
- 记录工具调用次数、预算消耗与无进展中止原因，作为观测数据，不作为默认限制。
- 默认不做远程遥测；崩溃报告与匿名统计必须显式 opt-in。
- 调试日志只写本地，包含敏感字段时必须脱敏。

### 6.9 测试

- `packages/*` 核心逻辑必须有单元测试，使用 Vitest。
- 组件使用 Vue Test Utils 测试关键交互与条件渲染。
- 主进程服务使用临时目录做集成测试，覆盖审批、路径限制、事件持久化。
- 模型调用统一 mock `packages/providers`，测试不依赖真实网络。
- 事件 schema 与投影需要黄金样例测试，确保升级兼容。
- 提示词与上下文组装需要快照测试，防止无意改变行为。
- 权限、SSRF、MCP 连接治理与工具结果归一化需要有集成测试。
- 会话导出、跨会话搜索与消息编辑/重新生成需要有回归测试。
- 工作区索引、写前审批、文件引用与通知需要有集成或回归测试。
- 插件宿主需有 manifest 校验、权限拒绝、激活失败、热重载测试。
- 关键用户流程用 Playwright 做 Electron 端到端测试。
- 新增功能与修复缺陷必须附带对应测试；无法测试时需在提交说明中写明原因。

### 6.10 构建、脚本与质量门禁

根目录提供以下脚本，提交前全部通过：

```bash
pnpm dev            # 开发
pnpm build          # 构建
pnpm typecheck      # 类型检查
pnpm lint           # ESLint
pnpm lint:style     # stylelint
pnpm test           # 单元测试
pnpm test:e2e       # 端到端测试
pnpm format         # Prettier
pnpm rebuild:native # 为 Electron 重建 node-pty
```

- 禁止提交 `typecheck` 或 `lint` 失败代码。
- 禁止在源码中写死环境路径、密钥、服务地址。
- 依赖新增必须在 PR 说明用途与替代方案评估。
- 涉及提示词、工具 schema、上下文注入或会话历史的功能，必须在 PR 说明 token 影响，并对比修改前后的输入 token。
- 不得无依据增加默认上下文；新增自动注入内容必须提供按需加载或关闭路径。
- 构建产物、插件产物、日志文件不得入库。
- 提交前必须确认 `.gitignore` 覆盖 `node_modules`、`dist`、`out`、日志与本地数据库。
- `tsconfig.base.json` 只提供共享编译选项；其 `include` 仅用于避免 IDE 把空 base 配置判为非法项目，子配置必须用各自的 `include` / `exclude` 覆盖。

### 6.11 Git 规范

- 使用 Conventional Commits：`<type>(<scope>): <subject>`。
- type：`feat`、`fix`、`refactor`、`perf`、`docs`、`test`、`build`、`chore`。
- scope 使用模块名：`chat`、`session`、`workspace`、`plugin-host`、`providers`。
- 一次提交只做一件逻辑上的事；重构与功能改动分开提交。
- 提交前检查 `git diff`，禁止提交调试代码、临时日志、密钥。
- 不得擅自改写他人提交历史或强推共享分支。

### 6.12 CI 与发布

- PR 门禁：`typecheck`、`lint`、`stylelint`、单元与集成测试；关键流程跑 e2e smoke。
- CI 在 macOS 与 Windows 上构建；构建产物不包含密钥、日志与本地缓存。
- 发布遵循 semver；tag 触发构建，生成 dmg 与 nsis，签名与公证后发布。
- 自动更新使用 stable / beta 通道；更新前校验签名与版本，失败不得破坏现有安装。
- 每次发布必须更新 CHANGELOG 与迁移说明；重大变更先在 beta 通道验证。
- 发布脚本、证书与签名密钥不得入库。

---

## 7. 路线图与验收

### 7.1 里程碑

| 阶段 | 内容 |
| --- | --- |
| M0 | 规范、monorepo 骨架、electron-vite + Vue、类型化 IPC、深浅主题与动效 token、布局占位、事件总线与扩展点骨架、CI 门禁 |
| M1 | 单 Agent 闭环：多提供商、流式对话、工具调用、审批、多会话与重命名/置顶、自动标题、消息编辑/重生成/停止、可选工作区与路径授权、事件流持久化、文件输出与另存为、读改跑测验证 |
| M2 | 文件修改审批强化：写文件与执行命令前展示路径、命令、cwd、实际 diff 或写入内容与影响范围；输入框 `@` 文件引用与轻量索引，普通文件插入路径、图片读取并作为视觉内容发送；内置终端面板（xterm + node-pty，多标签、拖拽宽度、关闭确认与右键菜单），AI 命令直接创建终端标签；跨会话搜索；会话导出；后台通知。明确不做文件树、Monaco、文件 IDE、Git 集成、独立变更审阅面板与回滚 UI |
| M3 | 工具完善、图像生成、Office 生成、媒体搜索、本地二进制文件读取与按类型处理、Skill/MCP 目录扫描与注册 |
| M4 | 插件宿主、目录扫描、Extensions 管理页、`token-usage` 示例 |
| M5 | 产品化打包：发布流水线、签名、公证、自动更新、崩溃恢复 |

### 7.2 阶段验收标准

| 阶段 | 完成标准 |
| --- | --- |
| M0 | 应用可启动；深浅主题可切换；IPC 往返成功；事件总线与插槽注册表骨架可用；`typecheck`、`lint` 全绿；渲染层无 Node 访问 |
| M1 | 完成 3 个任务（代码修复、文档修改、脚本数据处理，可用临时会话）；未授权路径触发授权；多会话切换不中断后台 Run；标题可自动生成、重命名与置顶；消息可编辑重发、重新生成与停止；AI 输出文件可另存；重启后会话与工作区可恢复 |
| M2 | 文件与命令审批展示真实路径、参数、cwd、diff/写入内容和影响范围；`@` 可在工作区内检索文件并尊重 `.gitignore`，图片按视觉内容发送；内置终端默认使用工作区目录，无工作区时使用根目录；状态栏可打开终端面板，支持多标签、拖拽宽度、搜索、指定目录、拖入文件、关闭运行中终端二次确认；AI 命令在终端标签中执行；跨会话搜索可跳转；会话可导出；后台完成/失败有系统通知 |
| M3 | 工具覆盖既定清单；图像模型可配置并生成图片；Office 文件与媒体搜索可用；本地二进制文件可按类型读取、转文本或按文件引用处理，不把原始二进制塞入上下文；`<userData>/mcp` 可自动扫描接入；`<userData>/skills` 可自动注册并通过 `/skill` 调用 |
| M4 | 将示例插件放入 `<userData>/plugins` 后自动注册；可启用/禁用；越权调用被拒绝；热重载不残留副作用 |
| M5 | dmg 与 nsis 可安装；签名与公证通过；自动更新可用；崩溃恢复不丢事件；性能达标 |

---

## 8. 开源与社区

### 8.1 许可证

- 项目确定开源，许可证尚未最终确定。
- 推荐 **Apache-2.0**（含专利授权，适合平台型项目与插件生态）；若追求最简，可选 MIT。
- 许可证确定后必须新增 `LICENSE` 文件，并在 README 中声明。

### 8.2 仓库必备文件

```text
README.md            # 产品介绍、安装、快速开始
LICENSE              # 开源许可证
CONTRIBUTING.md      # 贡献流程、开发环境、提交规范
CODE_OF_CONDUCT.md   # 社区行为准则
SECURITY.md          # 漏洞报告方式与安全策略
CHANGELOG.md         # 版本变更记录
.github/             # Issue 与 PR 模板（GitHub / Gitee）
```

### 8.3 贡献流程

- 外部贡献遵循 Conventional Commits 与本文工程规范。
- PR 必须包含测试或说明无法测试的原因。
- 涉及架构、协议、权限模型的变更必须先在 `docs/decisions/` 提交 ADR。
- 插件、技能与 MCP 通过目录安装；在线市场与自动下载后续再设计。

---

## 9. 待决策与开放问题

| 决策 | 当前状态 | 建议 |
| --- | --- | --- |
| 产品名与包 scope | 已定 | Nexus / `@nexus/*` |
| 开源许可证 | 待定 | Apache-2.0 |
| 应用 appId / bundle id | 待定 | `com.nexus.harness` 占位，确定域名后替换 |
| SQLite 实现 | 待定 | 优先 `node:sqlite`，M0 验证 Electron 运行时；不可用则 `better-sqlite3` |
| 默认提供商 | 待定 | 首次启动引导选择，不写死默认模型 |
| 插件加载 | 目录扫描 | `<userData>/plugins`，启动与目录变化时注册 |
| 插件 API 类型 | 不单独发包 | 由 `packages/shared/src/plugin-api.d.ts` 提供 |
| 内部包发布 | 不发布 npm | `packages/*` 仅通过 `workspace:*` 在仓库内使用 |
| 插件 UI 渗透 | 标准 slots + skins | 消息尾部、输入区、状态栏、全局背景 |
| 非核心功能实现 | 内置插件优先 | 使用统计、主题、附加面板与集成交给插件 |
| 插件底层 | 契约先行 | 事件总线、插槽、权限网关先于插件宿主实现 |
| Skill 加载 | 目录扫描 | `<userData>/skills`，支持 `/skill-name` 主动调用 |
| Skill 选择 | search + read 两段式 | 显式 `/skill-name` 优先 |
| MCP 加载 | 目录扫描 | `<userData>/mcp`，逐服务启用与信任 |
| MCP 工具 | 自动注册 | 仅启用、信任且连接的 Server 进入工具 schema |
| MCP 连接治理 | 缓存 + 超时 + 并发上限 | 空闲 TTL、失败负缓存与工具名净化 |
| 工作区模型 | 可选 | Session 可无工作区；Scope = workspace + 唯一工作区目录 |
| 设置优先级 | 已定 | Session > Workspace > App |
| 路由 | 不引入 | 单主窗口 + 弹窗，视图由导航状态驱动 |
| 路径授权 | 会话级 | 会话流内联授权卡，按目标路径请求，敏感目录始终拒绝 |
| 检查点 | 逐文件快照 | 不依赖 git，工作区与临时会话通用 |
| AI 输出文件 | `<userData>/files` | 永久保留，手动清理；仅通过 fileId 另存为 |
| Office/媒体工具 | 核心工具 | `save_*` 与 Pexels 图片/视频搜索内置 |
| Prompt 策略 | 静态前缀 + 动态追加 | 动态上下文追加到用户消息，保护 prompt cache |
| Prompt 行为 | 内置约束 | 反幻觉、工具诚实、链接真实性、文件生成自检 |
| 图像生成 | 工具化 | 独立图像模板（URL + body + result + 可选 poll），文本模型通过 `generate_image` 调用 |
| 上下文压缩 | 自动 | 超过输入预算 70% 触发，写入 `context.compacted` |
| 工具并发 | 只读可并行 | 写与执行工具串行 |
| Agent 模式 | Plan / Build | Plan 只读，Build 执行；切换需用户操作 |
| 交互式提问 | 结构化 `ask_user` | 行内选项、暂停 Run、回答写事件 |
| 工具调用上限 | 默认不启用 | 次数只做观测，用户可配置可选硬上限 |
| 消息操作 | 编辑重发 / 重新生成 / 停止 | 旧消息标记 `superseded`，不物理删除 |
| 变更审阅 | 不做 | App 内不提供独立审阅面板与回滚 UI，深度审阅交给外部工具；写前审批展示实际变更 |
| 工作区索引 | SQLite 增量索引 | 尊重 `.gitignore`，跳过二进制与大文件 |
| 本地二进制读取 | M3 | 图片走视觉输入；其他类型按专用读取器、转文本或文件引用处理 |
| Git 集成 | 不做 | 不提供 Git 工具、状态或提交能力 |
| 通知 | 系统通知 + Dock/托盘 | 后台完成、失败或等待时提醒 |
| 模型配置 | 支持 `extra_params` 与自定义 headers | 上下文窗口、token 价格、连接测试 |
| 预算触发 | 交互提示可继续 | 后台或无人值守 Run 硬停 |
| 会话恢复 | 事件回放 | 未完成 Run 标记 `interrupted` |
| 会话模型 | 多会话 | 独立上下文，受全局并发限制 |
| 会话标题 | AI 自动总结 | 基于首条用户消息，用户可重命名 |
| 会话组织 | 置顶 + 最近 | 支持跨会话搜索 |
| 会话导出 | Markdown / HTML / PDF | 脱敏后由用户选择保存路径 |
| 跨会话搜索 | SQLite FTS5 | 消息正文；结果附会话标题与定位信息 |
| 网络访问 | 默认拒绝 | 按 provider / 域名显式放行 |
| 发布 | 签名 + 自动更新 | stable / beta 双通道 |
| 网络工具 | 仅内置媒体搜索 | Pexels API Key 本地配置；其他网络能力后续通过 MCP 或 Skill 扩展 |
| MCP 接入时机 | M3 | 先支持本地 stdio Server |
| 高风险插件权限 | 需单独评审 | `workspace:write`、`tools:register`、`network` 默认关闭 |
| 自动更新渠道 | M5 | stable / beta 双通道 |
| 遥测与崩溃报告 | 默认关闭 | 仅显式 opt-in |
| 国际化范围 | `zh-CN` 优先 | 结构预留 `en-US` |

---

## 10. 新代码自检清单

提交前逐项确认：

- [ ] 文件位置符合目录职责，没有跨模块深路径引用。
- [ ] 组件已按标准拆分，展示组件不访问 store 与 IPC。
- [ ] 命名符合第 6 节，无拼音、无无意义缩写。
- [ ] 新能力通过 tool / skill / plugin 进入，`core` 中没有领域硬编码。
- [ ] 设计阶段已先评估插件化；能插件化的功能没有直接做进 `core` 或主界面，内置能力有明确理由。
- [ ] 非核心功能优先实现为内置插件；插件与宿主使用同一 manifest、权限与贡献点契约。
- [ ] 所有导出成员与关键代码块有中文注释；没有 `/* ... */`，没有死代码。
- [ ] 基础控件优先使用 Naive UI；自定义组件只用于 Naive UI 覆盖不到的区域，并补齐交互状态。
- [ ] 所有颜色来自语义 token，深浅主题下均已检查。
- [ ] 尺寸、间距、字号与圆角使用偶数（推荐 4 的倍数），1px 边框除外。
- [ ] 异步调用未使用 `void` 抑制，已显式 `await` 或 `.catch()`。
- [ ] 动效使用 token，`prefers-reduced-motion` 与 Windows 回退均已验证。
- [ ] 长列表已虚拟化，重计算没有阻塞渲染主线程。
- [ ] 跨进程数据经过 zod 校验，公开方法有显式返回类型。
- [ ] 已评估 token 成本：没有注入无关全文或重复提示，工具输出、历史与文件内容可按需读取或压缩。
- [ ] 新功能提供低 token 路径，并对同类任务的输入 token 做了前后对比或回归验证。
- [ ] 设置项经 zod 校验，API Key 随本地 Provider 配置保存。
- [ ] 模型配置支持 `extra_params`、自定义 headers、上下文窗口与 token 价格，并可测试连接与刷新模型列表。
- [ ] 上下文压缩保留不可压缩内容，写入 `context.compacted`，失败可降级为硬截断。
- [ ] 系统提示包含反幻觉、工具诚实、链接真实性与文件生成自检约束。
- [ ] 路径访问基于 Workspace root + Session RootGrant，未授权路径必须走授权流程。
- [ ] 无工作区会话可正常发送与对话；首次本地工具调用可请求目录授权，取消后返回 `TOOL_WORKSPACE_REQUIRED`。
- [ ] RootGrant 按会话隔离并写入事件，不跨会话继承。
- [ ] AI 输出文件只写入 `<userData>/files`，默认永久保留、手动清理，仅通过 fileId 另存为。
- [ ] 工具结果统一归一化，文件与媒体落盘并记录来源，不把二进制直接塞进上下文。
- [ ] Office 与文本生成文件写入 `files`，记录 `file.created`，不直接写工作区。
- [ ] 本地 PDF/Word/Excel/PPT/ZIP 抽取有大小、条目数与解压体积限制。
- [ ] 图像生成结果写入 `files`，图片按视觉内容发送，其他二进制不直接塞进上下文，并记录用量与审批。
- [ ] 高风险操作有审批、事件记录与回滚路径。
- [ ] 审批决定与自动放行全部写入事件，敏感目录不可绕过。
- [ ] 危险命令被拦截；AI 命令在终端标签中执行；关闭运行中终端需二次确认并终止进程组；输出超限截断。
- [ ] Run 有预算与无进展检测，工具调用次数只做观测，取消能终止工具进程树。
- [ ] Plan 模式只暴露只读工具，拒绝副作用调用，模式切换写入事件。
- [ ] `ask_user` 结构化提问、暂停 Run、回答写入事件；后台运行不可用。
- [ ] 会话可从事件恢复，未完成 Run 有明确处理。
- [ ] 多会话切换不中断后台 Run；标题、置顶与最近状态可持久化。
- [ ] 跨会话搜索索引增量更新，删除会话时清理。
- [ ] 会话导出 Markdown/HTML/PDF 不含密钥，保存路径由用户确认。
- [ ] 消息编辑/重发/重新生成/停止写入事件，旧消息标记 `superseded`。
- [ ] 写文件与执行命令前展示实际路径、参数、cwd、diff/写入内容和影响范围，拒绝后不执行。
- [ ] 工作区索引尊重 `.gitignore`，跳过二进制与大文件，文件监听防抖。
- [ ] 本地二进制文件按类型读取、转文本或按文件引用处理，不把原始二进制塞入上下文。
- [ ] 后台完成/失败/等待时发送系统通知；终端支持搜索、指定目录新建、拖拽排序、快捷键、上下文菜单与设置。
- [ ] 网络访问默认拒绝，按域名与提供商显式放行；URL 经 SSRF 校验并限制重定向与响应大小。
- [ ] 发布产物已签名/公证，升级失败可回退。
- [ ] 插件、技能、MCP 的 manifest/config 经 zod 校验；无效条目跳过并记录。
- [ ] Skill 只解析 frontmatter，完整内容在 `read_skill` 后注入并记录 `skill.activated`。
- [ ] MCP 工具仅注入已启用、信任且连接的 Server，调用始终审批。
- [ ] MCP 连接有缓存、空闲 TTL、失败负缓存、超时与并发上限，工具名已净化。
- [ ] 插件入口路径限制在插件目录内，扩展能力经宿主权限网关。
- [ ] 新功能已同步发出领域事件、暴露标准插槽，并经过权限网关。
- [ ] 插件 slots 与皮肤在宿主容器内渲染并正确清理；皮肤代码不访问隔离层外的宿主 DOM 或注入全局 CSS。
- [ ] 事件钩子只读订阅，不能修改或拦截工具调用与审批；高频事件默认不暴露。
- [ ] 插件未直接修改宿主 DOM 或注入全局 CSS。
- [ ] 插件新增能力已声明权限，未绕过宿主 API 直接访问系统资源。
- [ ] 副作用有清理逻辑，错误被处理且不泄露敏感信息。
- [ ] 新增逻辑有测试，`typecheck`、`lint`、`test` 全部通过。
- [ ] 提交信息符合 Conventional Commits，提交内容单一。

---

## 11. 附录

### 附录 A：事件目录

| 事件 | 关键 payload | 触发时机 |
| --- | --- | --- |
| `workspace.opened` | `workspaceId`、`root` | 打开工作区 |
| `workspace.trusted` | `workspaceId`、`trustLevel` | 用户确认信任 |
| `session.created` | `sessionId`、`workspaceId` | 新建会话 |
| `session.workspace.bound` | `sessionId`、`workspaceId` | 临时会话绑定工作区 |
| `session.mode.changed` | `sessionId`、`mode` | Plan / Build 模式切换 |
| `session.model.changed` | `sessionId`、`providerId`、`modelId` | 会话切换服务商或模型 |
| `session.renamed` | `sessionId`、`title`、`source` | 自动标题或用户重命名 |
| `session.pinned` | `sessionId` | 置顶会话 |
| `session.unpinned` | `sessionId` | 取消置顶 |
| `session.exported` | `sessionId`、`format`、`fileId` | 导出会话 |
| `scope.granted` | `sessionId`、`path`、`kind`、`access`、`source` | 新增 root 授权 |
| `scope.revoked` | `sessionId`、`path` | 移除 root 授权 |
| `session.completed` | `sessionId`、`summary` | 会话结束 |
| `session.failed` | `sessionId`、`error` | 会话失败 |
| `session.archived` | `sessionId` | 归档会话 |
| `run.started` | `runId`、`model`、`budget` | 开始执行 |
| `run.completed` | `runId`、`durationMs` | 执行成功 |
| `run.failed` | `runId`、`error` | 执行失败 |
| `run.cancelled` | `runId`、`reason` | 用户取消 |
| `run.interrupted` | `runId`、`reason` | 应用中断或崩溃后恢复 |
| `run.budget.exceeded` | `runId`、`budget`、`threshold`、`action` | 预算触发，记录继续或停止 |
| `run.no_progress` | `runId`、`reason` | 连续无进展，暂停等待用户 |
| `message.reasoning.delta` | `messageId`、`text` | 推理内容增量，仅用于展示与导出 |
| `message.delta` | `messageId`、`text` | 流式文本增量 |
| `message.completed` | `messageId`、`content`、`reasoning` | 消息完成 |
| `message.edited` | `messageId`、`content` | 用户编辑消息 |
| `message.regenerated` | `messageId`、`sourceMessageId` | 重新生成回复 |
| `message.superseded` | `messageId`、`reason` | 旧回复被编辑或重生成替代 |
| `context.compacted` | `beforeTokens`、`afterTokens`、`strategy`、`summaryRef`、`artifactIds` | 上下文自动或手动压缩，含工具输出与摘要产物引用 |
| `tool.requested` | `toolCallId`、`name`、`input` | 发起工具调用 |
| `tool.completed` | `toolCallId`、`ok`、`output`、`artifactId`、`bytes` | 工具执行完成；长输出转为 Artifact 引用 |
| `tool.failed` | `toolCallId`、`error` | 工具执行失败 |
| `approval.requested` | `approvalId`、`toolCallId`、`scope` | 请求审批 |
| `approval.resolved` | `approvalId`、`decision` | 审批完成 |
| `ask_user.requested` | `requestId`、`questions` | Agent 请求澄清 |
| `ask_user.resolved` | `requestId`、`answers`、`cancelled` | 用户回答或取消 |
| `checkpoint.created` | `checkpointId`、`runId`、`label` | 创建检查点 |
| `checkpoint.restored` | `checkpointId`、`runId` | 回滚到检查点 |
| `file.created` | `fileId`、`runId`、`name`、`mime`、`bytes`、`source` | 生成或下载的文件保存到 `files` |
| `usage.recorded` | `provider`、`model`、`modality`、`inputTokens`、`outputTokens`、`cacheReadTokens`、`cacheWriteTokens`、`reasoningTokens`、`images`、`cost` | 模型调用结束 |
| `settings.updated` | `key`、`scope` | 设置变更 |
| `plugin.activated` | `pluginId`、`version` | 插件激活 |
| `plugin.deactivated` | `pluginId` | 插件停用 |
| `plugin.discovered` | `pluginId`、`version`、`path` | 扫描到插件 |
| `plugin.error` | `pluginId`、`error` | 插件加载或运行失败 |
| `skill.activated` | `skillId`、`trigger`、`runId` | Skill 被显式或自动激活 |
| `mcp.connected` | `serverId`、`tools` | MCP Server 连接成功 |
| `mcp.disconnected` | `serverId`、`reason` | MCP Server 断开 |
| `terminal.opened` | `terminalId`、`sessionId`、`cwd`、`pid`、`shell` | 用户创建内置终端 |
| `terminal.closed` | `terminalId`、`sessionId` | 关闭内置终端 |
| `terminal.started` | `terminalId`、`command`、`cwd`、`pid` | AI 命令创建内置终端 |

### 附录 B：插件权限清单

| 权限 | 含义 | 当前 |
| --- | --- | --- |
| `storage` | 使用按插件隔离的键值存储 | 开放 |
| `events:<event>` | 订阅指定领域事件 | 开放 |
| `ui.panel` | 注册侧栏/主区面板 | 开放 |
| `ui.slot` | 注册消息尾部/输入区等插槽 | 开放 |
| `ui.skin` | 贡献全局背景皮肤，并通过代码绘制 | 开放 |
| `ui.statusbar` | 注册状态栏条目 | 开放 |
| `ui.command` | 注册命令与快捷键 | 开放 |
| `ui.notification` | 发送应用内通知 | 开放 |
| `workspace:read` | 只读访问工作区文件 | 开放 |
| `workspace:write` | 写入工作区文件 | 不开放 |
| `tools:register` | 向 Agent 注册工具 | 不开放 |
| `network` | 发起网络请求 | 不开放 |

### 附录 C：文档索引

| 文档 | 内容 |
| --- | --- |
| `AGENTS.md` | 唯一强制性开发规范与索引 |
| `PLUGIN_DEVELOPMENT.md` | 插件目录、manifest、API、插槽与事件开发指南 |
| `README.md` | 产品介绍、安装与快速开始 |
| `docs/decisions/` | 架构与产品决策记录（ADR） |
| `docs/` 其他 | 详细设计、协议说明与评测报告 |

新增文档必须在本文档索引中登记，避免规范与实现脱节。
