# Nexus

> 一个面向真实任务的 AI Agent 工作台：Agent 能调用工具、验证结果并自我修正；所有工具调用、审批、变更与费用都可审计，文件修改在写入前必须审批。

Nexus 不是聊天框，而是承载 Agent 的 **harness**：负责上下文、工具执行、权限审批、事件流、检查点回滚与 UI，让模型能力变成稳定产出。

## 能力概览

- **Agent 循环**：流式输出、工具调用、结果回填、中断、reasoning 预算、无进展检测
- **多提供商**：OpenAI 兼容、Anthropic（含 prompt cache）、Ollama
- **上下文工程**：预算估算、真实 usage 校准、摘要压缩、工具输出落 Artifact
- **工具系统**：读写 / patch / grep / glob / 命令 / 联网 / 生图 / Office / MCP / 终端 / Skill
- **审批与安全**：权限网关、路径白名单、敏感路径拦截、危险命令检测、会话级 root 授权
- **事件溯源**：append-only 事件流 + SQLite 投影，支持重启恢复与跨会话搜索
- **扩展**：子代理（explore / general）、Plan / Build 模式、插件槽位与皮肤、MCP、Skill

## 技术栈

Node.js 24 · pnpm workspace · Electron 45 · Vue 3.5 · TypeScript 5.9 · Naive UI · Pinia · zod · electron-vite · Vitest

完整规范见 [`AGENTS.md`](./AGENTS.md)。

## 目录结构

```text
apps/desktop/        # Electron 应用（main / preload / renderer）
packages/
  core/              # agent 循环、事件流、工具注册表、权限模型
  providers/         # 统一 LLM 抽象
  toolkit/           # 每个 AI 工具一个目录的实现
  runtime-utils/     # 路径、URL 安全、Shell 环境
  shared/            # zod 契约、跨端类型、插件 API 类型、IPC 通道
docs/                # 产品、架构与 ADR 决策记录
```

## 快速开始

前置：Node.js 24、pnpm 10。首次安装会为 Electron 重建 `node-pty`。

```bash
pnpm install
pnpm dev
```

## 常用脚本

```bash
pnpm dev            # 开发
pnpm build          # 构建
pnpm typecheck      # 类型检查
pnpm lint           # ESLint
pnpm lint:style     # stylelint
pnpm test           # 单元测试
pnpm test:e2e       # 端到端测试
pnpm format         # Prettier
pnpm dist:mac       # 构建 macOS dmg/zip
pnpm dist:win       # 构建 Windows NSIS 安装包
```

提交前请确保 `typecheck`、`lint`、`test` 全部通过。

## 文档

- [`AGENTS.md`](./AGENTS.md)：唯一强制性开发规范与索引
- [`docs/decisions/`](./docs/decisions/)：架构与产品决策记录（ADR）
- [`CONTRIBUTING.md`](./CONTRIBUTING.md)：贡献流程
- [`SECURITY.md`](./SECURITY.md)：漏洞报告方式
- [`CHANGELOG.md`](./CHANGELOG.md)：版本变更记录

## 许可证

[Apache-2.0](./LICENSE)
