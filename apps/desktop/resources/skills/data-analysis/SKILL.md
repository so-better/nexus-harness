---
name: data-analysis
description: 当用户要求分析 CSV、Excel、PDF 表格或本地数据文件时使用；先理解结构，再计算、汇总和校验结果。
metadata:
  tags: [数据, CSV, Excel, PDF, 分析, 校验]
  version: 1.0.0
  requires: [read, write, execute]
  source: nexus-self-authored
---
# Data Analysis

## 目标

基于原始数据给出可复核的结论，不编造数字或忽略缺失值。

## 步骤

1. 读取文件结构和少量样本，确认编码、列名、单位和时间范围。
2. 检查缺失值、重复、异常值、格式不一致和样本偏差。
3. 明确计算口径；需要假设时写明，不要静默填补关键数据。
4. 用脚本或表格工具完成计算，保留输入、口径和结果。
5. 交叉校验总量、抽样结果和边界值。
6. 需要输出表格时使用 save_excel；报告使用 save_word 或 save_pdf。

## 输出

- 数据范围和清洗规则。
- 关键结论和计算口径。
- 校验结果与限制。
- 生成文件引用（如有）。
