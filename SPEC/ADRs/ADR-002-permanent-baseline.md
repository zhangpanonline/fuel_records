# ADR-002 — initial_mileage 永久基线 + 删除唯一记录放行

P2 设计曾禁止删除车辆的唯一条（基线）记录，理由是"删了就没法算油耗了"。P5 引入车辆表后，车辆自带 `initial_mileage`，基线信息不再依赖记录本身——于是 P5 起删除了基线保护：唯一记录可以直接删除，`initial_mileage` 作为**永久隐式基线**留存，下次加油仍可正常计算油耗。

**决策**：`initial_mileage` 是车辆的永久隐式基线；`is_baseline` 仅标记该车当前的首条记录（删除后剩余首条会被级联重算重新标记）；删除唯一记录直接放行。

**Considered Options**：
- 保留"禁止删除唯一记录"（P2 旧设计）——用户无法清空重录，且与"车辆自带初始里程"的模型冗余
- 删除后重新标记基线 ✅

**Consequences**：
- `recalculate_consumption` 中 `previous is None` 分支即"该记录成为新的首条记录"，参考里程回退 `initial_mileage`
- e2e 规格书 §2.6/§3.2 与集成测试 IR-004 以此为准（2026-08-28 已修正 §3.2 的陈旧文案）

**关联文档**：`README.md` §4.1/§4.2 · `test-specs/unit-test-spec.md` UR-103
