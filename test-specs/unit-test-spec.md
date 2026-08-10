# Fuel Records — 单元测试规格书

> 本文档定义所有服务层单元测试用例。单元测试直接调用 Service 层函数，通过 SQLAlchemy Session 操作测试数据库（TRUNCATE 隔离），不经过 HTTP 层。覆盖核心业务逻辑、安全工具、油耗计算、级联重算、统计聚合等。
>
> **关联规格书**: [端到端测试规格书](./e2e-test-spec.md) | [集成测试规格书](./integration-test-spec.md)
>
> **前置要求**: 见 [测试前置要求](./test-prerequisites.md)（数据库、conftest、fixture、运行命令）

---

## 1. Security — 密码与 JWT

### US-001 密码哈希与验证

| 测试 | 期望 |
|------|------|
| 哈希后不等于原文 | `hash_password(pwd) != pwd` |
| 验证正确密码 | `verify_password(pwd, hashed) is True` |
| 验证错误密码 | `verify_password(pwd, hashed) is False` |

### US-002 哈希随机性

| 测试 | 期望 |
|------|------|
| 两次哈希相同密码 | 结果不同（salt 随机） |

### US-003 JWT 生成与验证

| 测试 | 期望 |
|------|------|
| 生成 token 并验证 | `payload["sub"] == "42"`, `payload["type"] == "access"` |
| 篡改 token 验证失败 | `pytest.raises(Exception)` |

---

## 2. Auth Service — 注册与登录

### UA-001 注册用户

| 测试 | 期望 |
|------|------|
| `register_user(db, data)` | 返回 `{"access_token":"...","token_type":"bearer"}`，JWT 中 sub 对应 user_id |

### UA-002 重复注册

| 测试 | 期望 |
|------|------|
| 相同用户名第二次注册 | 抛出 `DuplicateUserError("已被注册")` |

### UA-003 登录

| 测试 | 期望 |
|------|------|
| `login_user(db, data)` 正确密码 | 返回 `{"access_token":"..."}` |
| 错误密码 | 抛出 `ValueError("用户名或密码错误")` |
| 不存在的用户 | 抛出 `ValueError("用户名或密码错误")` |

---

## 3. Vehicle Service — 车辆管理

### UV-001 创建车辆

| 测试 | 期望 |
|------|------|
| `create_vehicle(db, VehicleCreate(name="KPT400", plate="京A12345", initial_mileage=10000), user_id=1)` | 返回 Vehicle(name="KPT400", plate="京A12345", user_id=1, is_active=True) |

### UV-002 获取车辆列表

| 测试 | 期望 |
|------|------|
| 用户 1 创建 2 辆车，用户 2 创建 1 辆，用户 1 查询 | 返回 2 辆（用户隔离） |

### UV-003 修改车辆

| 测试 | 期望 |
|------|------|
| 用户修改自己的车辆名称 | 名称已更新 |
| 用户 2 修改用户 1 的车辆 | 抛出 `ForbiddenError("无权修改")` |

### UV-004 删除车辆

| 测试 | 期望 |
|------|------|
| 删除无记录的车辆 | 删除成功，查询列表为空 |
| 删除有关联加油记录的车辆 | 抛出 `BadRequestError("无法删除")` |
| 删除不存在的车辆 | 抛出 `NotFoundError("车辆不存在")` |

### UV-005 车辆服务边界

| 测试 | 期望 |
|------|------|
| 修改不存在的车辆 | 抛出 `NotFoundError("车辆不存在")` |
| 他人删除你的车辆 | 抛出 `ForbiddenError("无权删除")` |

### UV-006 车辆服务边界

| 测试 | 期望 |
|------|------|
| 修改 initial_mileage 不影响已有记录油耗 | `FuelRecord.fuel_consumption` 值不变 |
| 切换 is_active → False | get_vehicles 仍返回（按 is_active 降序，不活跃排后面） |
| 空 VehicleUpdate payload | 车辆数据不变（name 等字段保持原值） |

---

## 4. Record Service — 加油记录

### UR-001 创建首条记录（使用 initial_mileage 作为隐式基线）

| 测试 | 期望 |
|------|------|
| 某车首条加油记录，`mileage == initial_mileage`（100==100） | `is_baseline=True`, `fuel_consumption=None`（无行驶距离） |
| 某车首条加油记录，`mileage > initial_mileage`（10000>100），`is_full_tank=True` | `is_baseline=True`, `fuel_consumption = 15/(10000-100)*100 ≈ 0.15` |
| 某车首条加油记录，`mileage < initial_mileage` | 抛出 `BadRequestError("不能低于车辆初始里程")` |

### UR-002 第二条记录油耗计算

| 测试 | 期望 |
|------|------|
| 加满：基线 10000km/15L，二条 10200km/10L | 油耗 = 10/(10200-10000)*100 = 5.0 L/100km |

### UR-003 非加满跳过计算

| 测试 | 期望 |
|------|------|
| 基线加满 → 二条 `is_full_tank=False` | 二条 `fuel_consumption=None` |

### UR-004 里程严格递增

| 测试 | 期望 |
|------|------|
| 下一条里程 ≤ 上一条 | 抛出 `BadRequestError("不能低于")` |

### UR-005 单价计算

| 测试 | 期望 |
|------|------|
| 加油 15L / 120 元 | `unit_price = 8.0` |

### UR-006 车辆归属校验

| 测试 | 期望 |
|------|------|
| 用用户 2 的车创建用户 1 的记录 | 抛出 `ForbiddenError("无权")` |

### UR-007 记录筛选

| 测试 | 期望 |
|------|------|
| `get_records(db, user_id=1, vehicle_id=X, is_full_tank=True)` | 仅返回加满的记录 |
| `get_records(db, user_id=1, vehicle_id=X, is_full_tank=False)` | 仅返回未加满的记录 |
| `get_records(db, user_id=1, vehicle_id=X, note="中石化")` | 按备注模糊匹配 |
| `get_records(db, user_id=1, vehicle_id=X, note="加油")` | 多条记录匹配 |
| 按日期范围筛选 `start_date` + `end_date` | 仅返回日期范围内的记录 |

### UR-008 记录服务边界

| 测试 | 期望 |
|------|------|
| 修改不存在的记录 | 抛出 `NotFoundError("记录不存在")` |
| 空更新 payload（无任何字段） | 返回原记录不变 |
| 他人删除你的记录 | 抛出 `ForbiddenError("无权删除")` |
| 重算时触发里程违规 | 抛出 `BadRequestError("不能低于")` |
| 车辆不存在时创建记录 | 抛出 `NotFoundError("车辆不存在")` |
| note 为纯空格时忽略筛选 | 返回全部记录（空格被忽略） |

### UR-009 记录服务更多边界

| 测试 | 期望 |
|------|------|
| `fuel_volume=0` | `BadRequestError("加油量必须大于 0")` |
| 修改 `is_full_tank` 从 False→True | `fuel_consumption` 从 null 变为计算值 |
| `get_records` 按 `record_date` 降序 | 最新记录排在最前 |
| `update_record` 触发级联重算后油耗正确 | `recalculate_consumption` 重新计算所有后续记录 |

---

## 5. Recalculate Consumption — 级联重算

### UR-101 修改中间记录 → 后续重算

| 测试 | 期望 |
|------|------|
| 3 条记录（10000/11000/12000），修改第二条里程为 10800 | 第二条油耗 ≈ 1.5，第三条油耗 ≈ 0.67 |

### UR-102 删除中间记录 → 后续重算

| 测试 | 期望 |
|------|------|
| 3 条记录（10000/11000/12000），删除第二条 | 第三条 `is_baseline=False`，油耗根据第一条里程和第三条里程+油量重新计算 |

### UR-103 删除唯一记录

| 测试 | 期望 |
|------|------|
| 该车仅 1 条记录，删除 | 删除成功，记录列表为空（`initial_mileage` 作为永久基线，下次加油仍可计算油耗） |

---

## 6. Stats Service — 油耗统计

### US-101 空统计

| 测试 | 期望 |
|------|------|
| `get_summary(db, user_id=1, vehicle_id=999)` | `record_count=0` |

### US-102 基础统计

| 测试 | 期望 |
|------|------|
| 2 条记录：10000km/15L=120元 + 10500km/10L=85元 | `total_mileage=500`, `total_fuel_volume=25`, `total_fuel_cost=205` |

### US-103 时间线聚合

| 测试 | 期望 |
|------|------|
| 指定 start_date/end_date + granularity | 返回正确的分组聚合数据 |

### US-104 统计边界

| 测试 | 期望 |
|------|------|
| `get_timeline` 非法 `group_by`（如 "quarter"） | `BadRequestError("group_by 仅支持 day, month, week")` |
| `get_timeline` `group_by="week"` 无 start_date | 正常返回（不崩溃） |
| `get_summary` 跨用户 vehicle_id | `record_count=0`（空统计，不报错） |

---

## 7. Expense Category Service — 记账分类

### UC-001 创建分类

| 测试 | 期望 |
|------|------|
| `create_category(db, name="餐饮", user_id=1)` | 返回 Category(level=1, parent_id=null, user_id=1) |
| `create_category(db, name="午餐", parent_id=L1_ID, user_id=1)` | level=2, parent_id 正确 |
| `create_category(db, name="外卖", parent_id=L2_ID, user_id=1)` | level=3 |
| 父分类不存在 | 抛出异常 |
| 同级同名 | 抛出 409 异常 |
| 尝试创建 level=4 | 抛出 400 异常 |
| 尝试将已有子分类的分类作为子分类 | 抛出异常 |

### UC-002 分类树构建

| 测试 | 期望 |
|------|------|
| `list_categories(db, user_id=1)` 多级分类 | 返回嵌套 children 树结构 |
| `_build_tree(categories)` | 根节点（parent_id=null）→ 子节点层级嵌套正确 |

### UC-003 重命名分类

| 测试 | 期望 |
|------|------|
| `update_category(db, cat_id, name="新名称", user_id=1)` | 名称已更新 |
| 修改不存在的分类 | 抛出 `NotFoundError("分类不存在")` |
| 修改排序字段 `sort_order` | 排序值已更新 |
| 同父级下重命名到已存在名称 | 抛出 `ConflictError("已存在")` |

### UC-004 删除分类

| 测试 | 期望 |
|------|------|
| 删除无子分类无记录的分类 | 删除成功 |
| 删除有子分类的分类 | 抛出异常 |
| 删除有关联支出记录的分类 | 抛出异常 |

### UC-005 关联记录计数

| 测试 | 期望 |
|------|------|
| `_count_linked_expenses(db, user_id, category)` 有记录 | 返回 > 0 |
| `_count_linked_expenses` 无记录 | 返回 0 |

### UC-006 支出分类服务边界

| 测试 | 期望 |
|------|------|
| 删除不存在的分类 | 抛出 `NotFoundError("分类不存在")` |

### UC-007 分类服务边界

| 测试 | 期望 |
|------|------|
| 跨用户 parent_id 创建子分类 | `NotFoundError("父分类不存在")` |
| 无分类用户 `list_categories` | 返回空列表 `[]` |
| 仅修改 `sort_order` | `sort_order` 更新，`name` 不变 |

---

## 8. Expense Service — 支出记录

### UE-001 分类链校验

| 测试 | 期望 |
|------|------|
| `_validate_category_chain(db, user_id, "餐饮", "午餐", "外卖")` 合法链 | 无异常 |
| `_validate_category_chain(db, user_id, "餐饮", "晚餐", "外卖")` L2 不匹配 | 抛出 `BadRequestError("不属于一级分类")` |
| `_validate_category_chain(db, user_id, "餐饮", "午餐", "外卖")` L3 不属于 L2 | 抛出 `BadRequestError("不属于二级分类")` |
| `_validate_category_chain(db, user_id, "不存在的分类", ...)` L1 不存在 | 抛出 `NotFoundError("一级分类")` |

### UE-002 创建支出

| 测试 | 期望 |
|------|------|
| `create_expense(db, expense_in, user_id=1)` 合法数据 | 返回 Expense，amount 正确，分类链关联正确 |
| amount 为 0 | 422 |
| amount 为负数 | 422 |

### UE-003 获取支出列表

| 测试 | 期望 |
|------|------|
| `get_expenses(db, user_id=1)` | 返回分页数据 `{items, total}` |
| 按日期范围筛选 | 仅返回范围内的记录 |
| 按一级分类筛选 | 仅返回该分类下的记录 |
| 按分页参数 | page/page_size 正确分页 |

### UE-004 修改支出

| 测试 | 期望 |
|------|------|
| `update_expense(db, exp_id, data, user_id=1)` 修改金额 | 金额已更新 |
| `update_expense` 修改备注 | 备注已更新 |
| 修改不存在的支出 | 抛出 `NotFoundError("支出记录不存在")` |

### UE-005 删除支出

| 测试 | 期望 |
|------|------|
| `delete_expense(db, exp_id, user_id=1)` | 删除成功，再次查询不存在 |
| 删除不存在的支出 | 抛出 `NotFoundError("支出记录不存在")` |

### UE-006 支出记录服务边界

| 测试 | 期望 |
|------|------|
| `test_get_expenses_with_category_l2_filter`: 按 L2 筛选支出列表 | 仅返回该 L2 下的记录 |
| `test_get_expenses_with_category_l3_filter`: 按 L3 筛选支出列表 | 仅返回该 L3 下的记录 |
| `test_get_expense_by_id_forbidden`: 跨用户访问单条支出 | 抛出 `ForbiddenError` |
| `test_update_expense_with_category_change`: 修改支出的分类链 | 分类更新成功，新分类链校验通过 |

### UE-009 支出服务边界

| 测试 | 期望 |
|------|------|
| `get_expenses` L2 + 日期范围组合筛选 | only matching expenses returned |
| 仅修改 `category_l1`（L2/L3 属于旧 L1） | `BadRequestError`（L2 不属于新 L1） |

---

## 9. Expense Stats Service — 记账统计

### US-201 ROLLUP 聚合

| 测试 | 期望 |
|------|------|
| `get_stats(db, user_id=1, group_by="none")` 有支出数据 | `category_breakdown` 包含 L1+L2+L3 / L1+L2 / L1 / grand total 四层 |
| 按 `category_l1` 过滤 | 仅返回该分类数据 |
| 空数据 | `total_amount=0`, `category_breakdown=[]` |

### US-202 月度聚合

| 测试 | 期望 |
|------|------|
| `get_stats(db, user_id=1, group_by="month")` | `items` 数组，每项含 `{period, total, breakdown}` |
| 跨月数据 | 按月份正确分组 |

### US-203 周聚合

| 测试 | 期望 |
|------|------|
| `get_stats(db, user_id=1, group_by="week")` | 按周正确分组 |

### US-204 年聚合

| 测试 | 期望 |
|------|------|
| `get_stats(db, user_id=1, group_by="year")` | 按年正确分组 |

### US-205 六区间统计

| 测试 | 期望 |
|------|------|
| `get_multi_summary(db, user_id=1)` 有数据 | `{current_year, current_month, current_week, recent_year, recent_month, recent_week}` 金额正确 |
| `get_multi_summary` 无数据 | 所有字段 `"0.00"` |
| 近一年不含起始日 | 12 个月前当天不纳入 |
| 当周从周一算起 | 周一至今天 |

### US-206 支出统计边界

| 测试 | 期望 |
|------|------|
| 非法 `group_by` 参数 | 抛出 `BadRequestError` |
| 按 L3 分类过滤统计 | 仅返回该 L3 的数据 |
| `test_get_multi_summary_today_none`: `today` 参数为 `None` | 使用 `date.today()` 作为默认值 |

### US-207 时间线聚合补充

| 测试 | 期望 |
|------|------|
| 空时间线（无记录） | 返回空列表 `[]` |
| 按天聚合 `group_by="day"` | 返回按天分组的数据，period 格式 `YYYY-MM-DD` |
| 按周聚合 `group_by="week"` | 返回按周分组的数据 |
| 带日期过滤的时间线 | 仅返回日期范围内的分组 |

### US-208 支出统计边界

| 测试 | 期望 |
|------|------|
| `start_date > end_date` | `record_count=0`，`total_amount="0.00"`（不报错） |

---

## 10. 边缘情况

### UE-007 时区与默认值

| 测试 | 期望 |
|------|------|
| 不传 `record_date` 时自动使用当前时间 | `record_date` 在创建前后合理范围内 |
| `_parse_date` 非法格式（如 `2025/01/01`） | 返回 `None` |
| `_parse_date` 非字符串类型 | 返回 `None` |
| `_parse_date` 空字符串 | 返回 `None` |

### UE-008 统计与过滤边缘

| 测试 | 期望 |
|------|------|
| 仅 `start_date` 无 `end_date` 过滤 | 仅过滤起始日期之后的记录 |
| 非加满记录重算 | `fuel_consumption` 设为 `None` |
| 删除中间记录后后续里程违规 | 触发重算时检测并抛出异常 |

---

## 11. Core Exceptions & Auth Deps

> 本节覆盖 `core/exceptions.py`（`BusinessError` 子类 → HTTP 状态码映射）以及 `core/deps.py`（`get_current_user` 的鉴权分支）。

### CE-001 BusinessError 默认状态码映射

| 测试 | 期望 |
|------|------|
| `to_http_status(BusinessError("test"))` | 返回 400 |

### CE-002 Token 无效 → 401

| 测试 | 期望 |
|------|------|
| `verify_access_token` 抛出异常 → `get_current_user` 捕获后 | 抛出 `HTTPException(status_code=401)` |

### CE-003 Token 缺少 sub → 401

| 测试 | 期望 |
|------|------|
| Token payload 无 `sub` 字段 → `get_current_user` | 抛出 `HTTPException(status_code=401)` |

### CE-004 Token 有效但用户不存在 → 401

| 测试 | 期望 |
|------|------|
| Token 中 `sub` 指向的用户已在数据库中删除 → `get_current_user` | 抛出 `HTTPException(status_code=401)` |

### CE-005 服务层参数校验

| 函数 | 场景 | 期望 |
|------|------|------|
| `create_record` | `fuel_volume <= 0` | `BadRequestError("加油量必须大于 0")` |
| `get_timeline` | 非法 `group_by` | `BadRequestError("group_by 仅支持 day, month, week")` |

---
> **关联**: 本规格书对应的实现代码位于 `backend/tests/test_services.py` 和 `backend/tests/test_core.py`。
