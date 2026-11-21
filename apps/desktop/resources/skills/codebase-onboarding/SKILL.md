---
name: codebase-onboarding
description: 当用户要求解释项目结构、梳理调用链、快速上手代码库或评估改动影响范围时使用；默认只读分析。
metadata:
  tags: [代码库, 架构, 调用链, onboarding, 影响分析]
  version: 1.0.0
  requires: [read]
  source: nexus-self-authored
---
# Codebase Onboarding

## 目标

用最少阅读建立可验证的项目地图，不罗列所有文件。

## 步骤

1. 阅读入口、README、AGENTS、包清单、构建脚本和目录结构。
2. 找出运行时入口、核心模块、数据流和外部依赖。
3. 针对用户问题追踪：入口 → 编排 → 核心实现 → 持久化或外部服务 → 测试。
4. 先用 glob、grep 和摘要定位，再按需读取实现。
5. 标出配置、权限边界、事件流、错误处理和测试入口。

## 输出

- 目录职责和关键模块。
- 主调用链或数据流。
- 改动某功能时应检查的文件与测试。
- 不确定项和下一步阅读路径。
