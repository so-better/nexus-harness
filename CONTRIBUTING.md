# 贡献指南

感谢参与 Nexus。开始前请先阅读 [`AGENTS.md`](./AGENTS.md)，它是本仓库唯一的强制性开发规范，与本文件冲突时以 `AGENTS.md` 为准。

## 环境准备

- Node.js 24.x
- pnpm 10.x（`packageManager` 已固定版本）

```bash
pnpm install   # 首次安装会为 Electron 重建 node-pty
pnpm dev
```

## 提交前自检

提交代码前，以下命令必须全部通过：

```bash
pnpm typecheck
pnpm lint
pnpm lint:style
pnpm test
```

涉及关键用户流程时，建议额外运行 `pnpm test:e2e`。

## 代码与结构约定

- 分层与依赖方向、目录职责、组件拆分、命名、注释与 TypeScript 规范见 `AGENTS.md` 第 3 节与第 6 节。
- `packages/*` 不发布 npm，仅通过 `workspace:*` 在仓库内使用。
- 渲染层禁止直接使用 `electron`、`node:*`、`fs`；跨进程数据必须定义在 `packages/shared` 并用 zod 校验。
- 非核心功能优先实现为内置插件，避免直接堆进 `core` 或主界面。

## 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/)：

```text
<type>(<scope>): <subject>
```

- type：`feat`、`fix`、`refactor`、`perf`、`docs`、`test`、`build`、`chore`
- scope 使用模块名：`chat`、`session`、`workspace`、`plugin-host`、`providers`
- 一次提交只做一件逻辑上的事；重构与功能改动分开提交。
- 提交前检查 `git diff`，禁止提交调试代码、临时日志与密钥。

## Pull Request

- PR 必须包含对应测试；确实无法测试时，请在描述中说明原因。
- 涉及提示词、工具 schema、上下文注入或会话历史的功能，请在描述中说明 token 影响。
- 涉及架构、协议、权限模型的变更，必须先在 `docs/decisions/` 提交 ADR。
- 新增依赖需说明用途与替代方案评估，且必须兼容 Apache-2.0。
- 修改插件 manifest、`ctx` API、权限、贡献点、事件签名或内置插件示例时，必须同步更新 `plugin-development` Skill、递增其版本号，并更新 `AGENTS.md` 相关契约。

## 报告问题

- 安全问题请按 [`SECURITY.md`](./SECURITY.md) 私下报告，不要公开提交 Issue。
- 功能缺陷与建议请使用 Issue 模板，并尽量附上复现步骤、环境与日志摘要（请勿包含密钥）。
