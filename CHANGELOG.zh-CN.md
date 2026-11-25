# Changelog

所有值得记录的变更都会写在这里。版本号遵循 SemVer。

## [Unreleased]

### Added

- 命令面板与全局快捷键。
- `Ctrl/Cmd+L` 快速切换主题。
- 更新日志入口与弹窗。
- 设置中的迁移备份导入导出。
- 工具按需加载：相关性召回、条件模型重排与 `search_tools` 兜底。
- `read_artifact` 分页回读压缩产物；`read_file`、`grep`、`glob`、`list_dir` 支持 `offset`/`limit` 分页。
- 记录缓存读写 token 并通过用量 API 暴露。

### Changed

- 全局记忆移入动态环境块，保持系统提示前缀可缓存。
- 工具重排仅在候选余量充足时触发，超时更短且失败回退 BM25。
- 文件与搜索结果完整透传；超过预算比例的输出在执行时落 Artifact，UI 保留全文并提供产物引用回读。

### Fixed

- 首次选择插件皮肤时下拉值不更新的问题。
- 会话打开后消息列表未贴底的问题。
- 小上下文模型的系统提示词与测试覆盖。
- 上下文估算计入回传 reasoning，并用真实 provider usage 校准。
- 压缩保留最近一轮工具输出，预览附带 `read_artifact` 回读提示。
- 已知但未注入的工具会自动补加载，不再误报 `TOOL_NOT_FOUND`。
- Anthropic prompt cache 仅在错误与缓存相关时才回退重试。
