# 架构与产品决策记录（ADR）

本目录记录 Nexus 的架构与产品决策。涉及架构、协议、权限模型等影响的变更，必须先在此提交 ADR，再实现。

## 何时需要 ADR

- 调整分层、目录结构或包依赖方向
- 变更事件 schema、IPC 契约、插件 API、权限模型
- 引入或替换关键依赖、存储方案、Provider 抽象
- 影响安全边界、数据保留、成本策略的产品决策

## 命名与模板

- 文件命名：`NNNN-<short-title>.md`，例如 `0001-event-sourcing.md`
- 复制 [`0000-template.md`](./0000-template.md) 开始撰写
- 状态：`Proposed` → `Accepted` / `Rejected` / `Superseded`
- 被替代的 ADR 保留原文，并在头部标注 `Superseded by NNNN`

## 索引

| 编号 | 标题 | 状态 |
| ---- | ---- | ---- |
| 0000 | 模板 | —    |

> 新增 ADR 后请在此表登记。
