# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — SmartFAB 预测引擎术语表（预测引擎/规则/权重/置信度/行为日志等）
- **`SPEC/GLOSSARY.md`** — 全项目术语表：油耗域/记账域/架构域/发布域
- **`SPEC/ADRs/`** — 架构决策记录（ADR-001~005），读与当前工作区域相关的决策

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo（本仓库）：

```
/
├── CONTEXT.md                 ← SmartFAB 术语（一个术语表，非通用）
├── SPEC/
│   ├── GLOSSARY.md            ← 全局术语表（油耗/记账/架构/发布）
│   ├── ADRs/                  ← 架构决策记录（ADR-001~005）
│   ├── *.md                   ← 模块规格书（EXPENSE/PERF/SMARTFAB/upgrade）
│   └── *.tickets.md           ← 模块任务清单
├── backend/
└── frontend/
```

> 注意：本仓库的领域文档不在 `docs/adr/`，而在 `SPEC/ADRs/`；全局术语不在根 `CONTEXT.md`（那是 SmartFAB 专用），而在 `SPEC/GLOSSARY.md`。

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `SPEC/GLOSSARY.md`（全局）或 `CONTEXT.md`（SmartFAB）. Don't drift to synonyms the glossary explicitly avoids (`_Avoid_` 别名).

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-001 (油耗参考"上次加满"), but worth reopening because…_
