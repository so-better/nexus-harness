# 内置 MCP 模板

启动时 `mcp.json` 会被同步到 `<userData>/mcp/`，只补齐缺失的 Server，不覆盖用户同名配置。

所有模板默认 `enabled: true`；用户可在 `mcp.json` 或扩展面板中将单个 Server 设为 `enabled: false`，工具调用仍需逐次审批。

已有 `mcp.json` 中同名 Server 的 `enabled` 不会被升级覆盖；如果之前手动关闭过内置 Server，需要自行重新开启。

## Playwright MCP

- 来源：Microsoft `@playwright/mcp`
- 当前锁定：`0.0.86`
- 依赖：Node、`npx`、Playwright Chromium
- 首次启用可能需要下载浏览器和 npm 包

## Browser Use MCP

- 来源：Browser Use 官方文档，`browser-use --cli-mcp`
- 当前锁定：`browser-use==1.0.6`
- 依赖：`uv`/Python、Chrome；云浏览器或托管模型可能还需要 `BROWSER_USE_API_KEY`
- 官方建议固定版本，升级前先验证命令与工具协议

## DeepWiki MCP

- 来源：DeepWiki 官方 MCP
- 类型：HTTP
- 地址：`https://mcp.deepwiki.com/mcp`
- 依赖：网络，无需本地安装
- 用途：理解开源仓库、检索仓库文档与代码结构

## Microsoft Learn MCP

- 来源：Microsoft Learn 官方 MCP
- 类型：HTTP
- 地址：`https://learn.microsoft.com/api/mcp`
- 依赖：网络，无需本地安装
- 用途：检索微软官方文档、教程与 API 说明

## Context7 MCP

- 来源：Upstash `@upstash/context7-mcp`
- 当前锁定：`4.7.3`
- 依赖：Node、`npx`、网络；部分场景需要 Context7 API Key

## 升级

修改 `mcp.json` 中的固定版本，并重新执行扩展页的保存/测试。不要直接改成未经验证的 `latest`。
