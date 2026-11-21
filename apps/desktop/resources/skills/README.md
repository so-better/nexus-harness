# 内置 Skill

该目录用于放置随应用分发的 Skill，启动时同步到 `<userData>/skills/`。

## 当前内置

- `code-review`：只读代码审查与风险分析。
- `bug-reproduce`：复现问题、定位根因、最小修复与验证。
- `fix-failing-tests`：修复测试、类型检查和 lint 失败。
- `safe-refactor`：保持行为的渐进式重构。
- `codebase-onboarding`：梳理项目结构、调用链和影响范围。
- `office-report`：生成 Word、Excel、PPT 和 PDF 报告。
- `data-analysis`：分析 CSV、Excel、PDF 表格等本地数据。
- `documentation-writer`：编写与真实代码一致的文档。
- `token-efficient-workflow`：减少无关上下文，同时保留验证证据。
- `plugin-development`：开发、调试、导入和定制 Nexus 插件。

## 规则

- 内置 Skill 目录 ID 是保留 ID；与内置副本同名的用户 Skill 会被内置版本覆盖。
- 其他用户 Skill 不会被删除或修改。
- 删除内置 Skill 后，下次启动会重新补齐。
- 引入第三方 Skill 时必须保留原始 LICENSE/NOTICE，并在 frontmatter `metadata` 中记录来源和版本。
- frontmatter 的 `name` 和目录 ID 都必须是小写 slug。
- `tags`、`version`、`requires` 放在 `metadata` 中，兼容 VS Code Skill 字段校验。
- `requires` 只用于说明，不构成权限或安全边界。
