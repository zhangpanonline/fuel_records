# ADR-001 — 油耗参考"上次加满"记录（跳过未加满）

油耗公式 `加油量 ÷（当前里程 − 参考里程）× 100` 只有在参考点是"加满状态"时才物理成立：加满时加入的油量恰好等于上次加满后烧掉的油量。2026-08-28 之前，代码用紧邻上一条记录（含未加满）作参考，导致"未加满 → 加满"序列的油耗被低估（例：52800 未加满 → 53200 加满 14L 算出 3.5 L/100km，正确值应参考 52500 加满记录，为 2.0）。规格书（e2e 2.3）则写着该场景"不计算"——规格与代码矛盾，经与用户盘问确认采用"跳到上次加满"。

**决策**：加满记录的参考里程 = 上一条**加满**记录的里程；无加满历史时回退 `initial_mileage`。里程校验仍与紧邻上一条记录（任意类型）比较，未加满记录本身仍不计算油耗。适用于 `create_record` 与 `recalculate_consumption`。

**Considered Options**：
- 不计算（原 e2e 规格书行为）——保守，但丢掉了可正确计算的数据
- 对紧邻上一条算（原代码行为）——物理上偏小，且与规格书冲突
- 跳到上次加满算 ✅ ——物理正确的标准做法（主流油耗 App 同款逻辑）

**Consequences**：
- `recalculate_consumption` 需同时维护两个指针：`previous`（紧邻上一条，里程校验与 `is_baseline` 判定）与 `last_full`（油耗参考）
- 历史数据无需迁移：级联重算按新规则自动修正
- 相关测试：`test_full_after_partial_uses_last_full`、`test_first_full_after_partial_falls_back_to_initial`、`test_recalc_skips_partial_for_full_reference`

**关联文档**：`README.md` §4.2/§7.1 · `test-specs/unit-test-spec.md` UR-010/UR-104 · `test-specs/e2e-test-spec.md` §2.3
