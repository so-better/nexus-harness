---
name: office-report
description: 当用户要求生成 Word、Excel、PPT 或 PDF 报告时使用；基于真实资料生成文件并检查内容完整性。
metadata:
  tags: [文档, Word, Excel, PPT, PDF, 报告]
  version: 1.0.0
  requires: [read, write]
  source: nexus-self-authored
---
# Office Report

## 目标

生成可直接使用的办公文件，不用占位符、虚构数据或未经验证的结论凑内容。

## 步骤

1. 明确交付格式、受众、结构、页数或工作表要求。
2. 收集源资料；缺数据时先说明缺口，不自行编造。
3. 选择工具：Word 用 save_word，Excel 用 save_excel，PPT 用 save_ppt，PDF 用 save_pdf。
4. 生成后检查文件名、格式、关键字段、表格和内容完整性。
5. 文件写入应用文件存储，提醒用户通过文件卡片另存为。
6. 不把生成文件直接写入工作区，不自动打开或执行。

## 输出

- 生成文件引用和内容摘要。
- 使用到的源资料。
- 未能满足的格式或数据缺口。
