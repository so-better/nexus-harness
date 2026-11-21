---
name: documentation-writer
description: 当用户要求编写或更新 README、使用说明、架构文档、ADR 或注释说明时使用；内容必须来自真实代码和资料。
metadata:
  tags: [文档, README, ADR, 架构, 注释]
  version: 1.0.0
  requires: [read, write]
  source: nexus-self-authored
---
# Documentation Writer

## 目标

写出与当前代码一致的文档，不虚构 API、参数、命令或链接。

## 步骤

1. 明确读者、文档类型和使用场景。
2. 阅读真实入口、类型、配置、测试和现有文档；以代码为准。
3. 先列提纲，再写入已验证的信息；不确定内容标注待确认。
4. 更新相关链接、示例、目录和交叉引用，删除失效内容。
5. 检查示例命令、字段名、路径和默认值是否一致。
6. 文档变更尽量单独提交；不自动 commit/push。

## 输出

- 新增或修改的文档路径。
- 信息来源。
- 未确认假设和后续补充项。
