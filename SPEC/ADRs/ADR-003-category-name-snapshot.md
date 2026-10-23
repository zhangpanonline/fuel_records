# ADR-003 — 支出记录冗余分类名快照

支出统计按分类聚合是最高频查询，若 `expenses` 只存分类外键，每次列表/统计都要 JOIN 分类表，且"重命名分类"会牵动全部历史记录与历史统计。因此支出记录冗余保存 `category_l1/l2/l3` 三个分类**名称**，查询与聚合零 JOIN（PostgreSQL `GROUP BY ROLLUP` 直接作用于名称列）。

**决策**：`expenses` 表冗余存分类名快照；分类重命名**不**回写历史记录（历史保留创建时的名称）；删除分类前校验无关联记录（按名称计数）。

**Considered Options**：
- 分类外键 + JOIN ——查询慢、重命名联动复杂
- 名称快照 ✅ ——查询快，代价是重命名后新旧记录在图表中分属不同分组

**Consequences**：
- 分类树与记录之间靠"名称"匹配（`_validate_category_chain`、`_count_linked_expenses`）
- 统计图表的"分类组"实际是"名称组"：重命名后旧名称成为历史分组
- 相关索引：`(user_id, category_l1, expense_date)` 等按名称列的聚合索引

**关联文档**：`SPEC/EXPENSE_SPEC.md` §2.2/§6 · `SPEC/GLOSSARY.md`（分类名快照）
