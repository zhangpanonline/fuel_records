# Issue tracker: 本地 Markdown tickets 体系

本仓库的工作以原子 Ticket 形式追踪在 Markdown 文件中，**不使用 GitHub Issues**（GitHub remote 仅用于部署与备份）。

## 约定

- **总任务清单**：`README.tickets.md` — 按 Phase → Ticket → 子章节（如 10.6.2.1）组织，每项带 `[ ]`/`[x]` 勾选、`依赖`、`难度`（★/★★/★★★）
- **模块任务清单**：`SPEC/*.tickets.md`（`SMARTFAB.tickets.md`、`PERF_SPEC.tickets.md`、`upgrade.tickets.md`），同一套格式
- **状态**：勾选状态即状态（`[ ]` 待办 / `[x]` 已完成），无独立 Status 行
- **完成一个 Ticket 后**：标记 `[x]` → 更新 `DIR.md`（目录结构说明）→ 在文件底部"更新记录"追加条目

## When a skill says "publish to the issue tracker"

把新工作拆成原子 Ticket 追加到 `README.tickets.md`（或对应 `SPEC/*.tickets.md`）的相应 Phase 下，保持 `[ ]`、依赖、难度标注；同时更新对应模块规格书。

## When a skill says "fetch the relevant ticket"

读取 `README.tickets.md` / `SPEC/*.tickets.md` 中对应的 Ticket 条目。用户通常直接引用 Ticket 编号（如 "Ticket 10.6.2"、"Phase 11.3"）。
