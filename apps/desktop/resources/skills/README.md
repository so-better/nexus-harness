# 内置 Skill

该目录用于放置随应用分发的 Skill，启动时同步到 `<userData>/skills/`。

- 内置 Skill 目录 ID 是保留 ID；与内置副本同名的用户 Skill 会被内置版本覆盖。
- 其他用户 Skill 不会被删除或修改。
- 删除内置 Skill 后，下次启动会重新补齐。
- 引入第三方 Skill 时必须保留原始 LICENSE/NOTICE，并在 frontmatter `metadata` 中记录来源和版本。
- frontmatter 的 `name` 必须是小写 slug，例如 `code-review`。
