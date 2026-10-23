# Fuel Records — 集成测试规格书

> 本文档定义所有 API 集成测试用例。集成测试通过 `TestClient` 模拟 HTTP 请求，使用真实测试数据库（`DB_PG_URL_TEST`），覆盖所有 REST API 端点的请求/响应契约、认证鉴权和数据隔离。
>
> **关联规格书**: [端到端测试规格书](./e2e-test-spec.md) | [单元测试规格书](./unit-test-spec.md)
>
> **前置要求**: 见 [测试前置要求](./test-prerequisites.md)（数据库、conftest、辅助函数、运行命令）

---

## 1. Health Check

### IH-001 健康检查无需认证

| 操作 | 期望 |
|------|------|
| `GET /api/v1/health` | 200, `{"status":"ok","version":"1.0.0"}` |

---

## 2. Auth API — 认证鉴权

### IA-001 注册新用户

| 操作 | 期望 |
|------|------|
| `POST /api/v1/auth/register` `{"username":"alice","password":"pass123"}` | 200, `{"access_token":"...","token_type":"bearer"}` |
| 相同用户名再次注册 | 409, `{"detail":"已被注册"}` |

### IA-002 登录

| 操作 | 期望 |
|------|------|
| `POST /api/v1/auth/login` `{"username":"bob","password":"pass123"}` | 200, 返回 JWT token |
| 使用错误密码登录 | 400, `{"detail":"用户名或密码错误"}` |
| 不存在的用户登录 | 400, `{"detail":"用户名或密码错误"}` |

### IA-003 获取当前用户信息

| 操作 | 期望 |
|------|------|
| `GET /api/v1/auth/me`（带有效 token） | 200, `{"id":...,"username":"...","is_active":true}` |
| 无 token 访问 | 401 |

### IA-004 全局鉴权拦截

| 操作 | 期望 |
|------|------|
| 无 Token 访问 `GET /api/v1/records/` | 401 |
| 无 Token 访问 `GET /api/v1/vehicles/` | 401 |
| 无 Token 访问 `GET /api/v1/expenses/` | 401 |
| 无 Token 访问 `GET /api/v1/expenses/categories` | 401 |
| 无 Token 访问 `GET /api/v1/expenses/stats` | 401 |
| 无 Token 访问 `GET /api/v1/stats/summary` | 401 |

---

## 3. Vehicles API — 车辆管理

### IV-001 创建车辆

| 操作 | 期望 |
|------|------|
| `POST /api/v1/vehicles/` `{"name":"KPT400","initial_mileage":50000}` | 200, 返回 Vehicle 对象（含 id/name/plate/user_id/is_active） |

### IV-002 获取车辆列表

| 操作 | 期望 |
|------|------|
| `GET /api/v1/vehicles/` | 200, 仅返回当前用户的车辆列表 |

### IV-003 修改车辆

| 操作 | 期望 |
|------|------|
| `PUT /api/v1/vehicles/{id}` `{"name":"new_name"}` | 200, 名称已更新 |
| 修改不存在的车辆 | 404 |
| 修改 plate | 200, plate 已更新 |
| 修改 is_active | 200, is_active 已切换 |

### IV-004 删除车辆

| 操作 | 期望 |
|------|------|
| 删除无关联记录的车辆 | 200, 删除成功 |
| 删除有关联加油记录的车辆 | 400, "无法删除：该车辆下有关联的加油记录" |
| 删除不存在的车辆 | 404 |

### IV-005 跨用户隔离

| 操作 | 期望 |
|------|------|
| 用户 B 修改用户 A 的车辆 | 403, "无权修改该车辆" |
| 用户 B 删除用户 A 的车辆 | 403 |

---

## 4. Fuel Records API — 加油记录

### IR-001 创建记录

| 操作 | 期望 |
|------|------|
| 创建首条记录（某车第一条加油） | 200, `is_baseline=true`, `fuel_consumption` 根据 `mileage > initial_mileage` 时计算，否则为 `null` |
| 创建第二条记录（加满） | 200, `is_baseline=false`, `fuel_consumption` 正确计算 |
| 创建记录时不填 `vehicle_id` | 422 校验错误 |
| 使用不存在或他人的 `vehicle_id` | 403, "无权操作该车辆" |
| 里程低于上一条记录 | 400, "里程数不能低于上一条记录" |
| `is_full_tank=false` 的记录 | 200, `fuel_consumption=null` |
| 含 `note` 的记录 | 200, 备注正确保存 |

### IR-002 获取记录列表

| 操作 | 期望 |
|------|------|
| `GET /api/v1/records/?vehicle_id=X` | 200, 按车辆筛选，仅当前用户 |
| `GET /api/v1/records/?vehicle_id=X&is_full_tank=true` | 200, 按加满筛选 |
| `GET /api/v1/records/?vehicle_id=X&is_full_tank=false` | 200, 按未加满筛选 |
| `GET /api/v1/records/?vehicle_id=X&note=中石化` | 200, 按备注模糊搜索 |
| `GET /api/v1/records/?vehicle_id=X&start_date=2025-01-01&end_date=2025-12-31` | 200, 按日期范围筛选 |
| 无 `vehicle_id` 参数 | 200, 返回 `[]` |
| `GET /api/v1/records/?vehicle_id=X&page=1&page_size=5` | 200, 分页返回（items + total） |

### IR-003 修改记录

| 操作 | 期望 |
|------|------|
| `PUT /api/v1/records/{id}` 修改备注 | 200, 备注已更新 |
| `PUT /api/v1/records/{id}` 修改里程 | 200, 该记录及后续记录油耗级联重算 |
| 修改不存在的记录 | 404 |
| 修改他人记录 | 403, "无权操作此记录" |

### IR-004 删除记录

| 操作 | 期望 |
|------|------|
| 删除中间记录（该车有 ≥ 2 条记录） | 200, 后续记录油耗级联重算 |
| 删除该车唯一记录 | 200, 删除成功（`initial_mileage` 作为永久基线，后续加油仍可计算油耗） |
| 删除不存在的记录 | 404 |
| 删除他人记录 | 403, "无权操作此记录" |

---

## 5. Stats API — 油耗统计

### IS-001 统计汇总

| 操作 | 期望 |
|------|------|
| `GET /api/v1/stats/summary?vehicle_id=X`（有记录） | 200, `{record_count,total_mileage,total_fuel_volume,total_fuel_cost,avg_consumption,avg_unit_price}` |
| `GET /api/v1/stats/summary?vehicle_id=X`（无记录） | 200, `record_count=0` |
| 无 auth | 401 |

> 💡 **性能优化**：`get_summary` 端点的底层 `stats_service.get_summary` 已优化为单次聚合查询（`min/max` + 聚合函数合并），支出统计 `get_stats` 分组模式使用单次 `ROLLUP` 查询替代 N+1 模式。测试预期不变——接口响应结构和数据完全一致。

### IS-002 月度统计

| 操作 | 期望 |
|------|------|
| `GET /api/v1/stats/monthly?vehicle_id=X&start_date=2025-01-01&end_date=2025-12-31` | 200, `{year,months:[{month,count,total_volume,total_cost,avg_consumption}]}` |

### IS-003 时间线统计

| 操作 | 期望 |
|------|------|
| `GET /api/v1/stats/timeline?vehicle_id=X&start_date=...&end_date=...&group_by=month` | 200, 按聚合粒度返回时间序列数据 |
| `GET /api/v1/stats/timeline?vehicle_id=X&group_by=day` | 200, 按天聚合 |
| `GET /api/v1/stats/timeline?vehicle_id=X&group_by=week` | 200, 按周聚合 |

---

## 6. Expense Categories API — 记账分类

### IC-001 创建分类

| 操作 | 期望 |
|------|------|
| `POST /api/v1/expenses/categories` `{"name":"餐饮"}` | 201, `level=1`, `parent_id=null` |
| `POST /api/v1/expenses/categories` `{"name":"午餐","parent_id":L1_ID}` | 201, `level=2` |
| `POST /api/v1/expenses/categories` `{"name":"外卖","parent_id":L2_ID}` | 201, `level=3` |
| 创建 level=4 | 400 |
| 父分类不存在 | 404 |
| 同级同名 | 409 |

### IC-002 获取分类树

| 操作 | 期望 |
|------|------|
| `GET /api/v1/expenses/categories` | 200, `{categories:[{...children:[{...children:[...]}]}]}` 嵌套树结构 |

### IC-003 修改分类

| 操作 | 期望 |
|------|------|
| `PUT /api/v1/expenses/categories/{id}` `{"name":"新名称"}` | 200, 名称已更新 |
| 修改不存在的分类 | 404 |

### IC-004 删除分类

| 操作 | 期望 |
|------|------|
| 删除无子分类且无关联记录的分类 | 204 |
| 删除有子分类的分类 | 400 |
| 删除有关联支出记录的分类 | 400 |
| 删除不存在的分类 | 404 |

---

## 7. Expenses API — 支出记录

### IE-001 创建支出

| 操作 | 期望 |
|------|------|
| `POST /api/v1/expenses/` `{"amount":35.5,"category_l1":"餐饮","category_l2":"午餐","category_l3":"外卖","expense_date":"2026-07-31"}` | 201, 返回 Expense 对象 |
| 无效分类链（L1-L2-L3 不匹配） | 400 |
| 金额为 0 或负数 | 422 |
| `note` 字段 | 201, 备注正确保存 |

### IE-002 获取支出列表

| 操作 | 期望 |
|------|------|
| `GET /api/v1/expenses/` | 200, `{items:[...],total:N}` |
| `GET /api/v1/expenses/?page=1&page_size=20` | 200, 分页 |
| `GET /api/v1/expenses/?start_date=2026-07-01&end_date=2026-07-31` | 200, 按日期筛选 |
| `GET /api/v1/expenses/?category_l1=餐饮` | 200, 按一级分类筛选 |
| `GET /api/v1/expenses/?category_l2=午餐` | 200, 按二级分类筛选 |
| `GET /api/v1/expenses/?category_l3=外卖` | 200, 按三级分类筛选 |

### IE-003 修改支出

| 操作 | 期望 |
|------|------|
| `PUT /api/v1/expenses/{id}` `{"amount":50}` | 200, 金额已更新 |
| `PUT /api/v1/expenses/{id}` `{"note":"new note"}` | 200, 备注已更新 |
| 修改不存在的支出 | 404 |
| 尝试修改到不存在的分类 | 400 |

### IE-004 删除支出

| 操作 | 期望 |
|------|------|
| `DELETE /api/v1/expenses/{id}` | 204 |
| 删除不存在的支出 | 404 |

### IE-005 支出统计

| 操作 | 期望 |
|------|------|
| `GET /api/v1/expenses/stats?start_date=...&end_date=...&group_by=none` | 200, `{group_by,total_amount,record_count,avg_daily,category_breakdown:[...]}` |
| `GET /api/v1/expenses/stats?start_date=...&end_date=...&group_by=month` | 200, `{group_by,items:[{period,total,breakdown}]}` |
| `GET /api/v1/expenses/stats?start_date=...&end_date=...&group_by=week` | 200, 按周聚合 |
| `GET /api/v1/expenses/stats?start_date=...&end_date=...&group_by=year` | 200, 按年聚合 |
| `GET /api/v1/expenses/stats?...&category_l1=餐饮` | 200, 按分类过滤 |

### IE-006 六区间统计

| 操作 | 期望 |
|------|------|
| `GET /api/v1/expenses/multi_summary` | 200, `{current_year,current_month,current_week,recent_year,recent_month,recent_week}` |
| 无数据时 | 200, 所有字段 `"0.00"` |

---

## 8. 数据隔离（跨模块）

### ID-001 用户 A 的数据用户 B 不可见

| 操作 | 期望 |
|------|------|
| 用户 A 创建车辆 + 加油记录，用户 B 获取车辆列表 | 空 |
| 用户 B 获取加油记录列表 | 空或仅自己的 |
| 用户 A 创建分类 + 支出，用户 B 获取分类树 | 空 |
| 用户 B 获取支出列表 | `total=0` |
| 用户 B 获取统计 | 空或 0 |

### ID-002 跨用户写保护

| 操作 | 期望 |
|------|------|
| 用户 B 修改用户 A 的车辆 | 403 |
| 用户 B 替用户 A 的车辆创建加油记录 | 403 |
| 用户 B 修改用户 A 的加油记录 | 403 |
| 用户 B 删除用户 A 的加油记录 | 403 |
| 用户 B 修改用户 A 的分类 | 403/404 |
| 用户 B 删除用户 A 的分类 | 403/404 |
| 用户 B 修改用户 A 的支出 | 403/404 |
| 用户 B 删除用户 A 的支出 | 403/404 |

---

## 9. API 边缘情况

### IE-007 加油记录筛选边界

| 操作 | 期望 |
|------|------|
| `GET /api/v1/records/?start_date=`（空字符串） | 正常处理，不报错 |
| `GET /api/v1/records/?end_date=...`（仅 end_date 无 start_date） | 正常过滤 |
| `GET /api/v1/records/?is_full_tank=`（空字符串，非 bool） | 422 校验错误 |
| `GET /api/v1/records/?note=%20%20%20`（空格备注） | 正常返回，空格被忽略 |

### IE-008 支出查询边界

| 操作 | 期望 |
|------|------|
| `GET /api/v1/expenses/?start_date=&end_date=`（空参数） | 正常返回全部 |
| `GET /api/v1/expenses/?page=1&page_size=20` | 分页正常 |

---

## 附录：规格 ID ↔ 测试类映射

| 规格 ID | 测试类 | 文件 |
|---------|--------|------|
| IH-001 | `TestAuthAPI.test_health_check` | test_api.py |
| IA-001~IA-004 | `TestAuthAPI` (8 tests) | test_api.py |
| IV-001~IV-005 | `TestVehicleAPI` (7 tests) | test_api.py |
| IR-001~IR-004 | `TestRecordAPI` (16 tests) | test_api.py |
| IS-001~IS-003 | `TestStatsAPI` (5 tests) | test_api.py |
| ID-001 (车辆) | `TestDataIsolation.test_vehicle_isolation` | test_api.py |
| IC-001~IC-004 | `TestExpenseCategoryAPI` (13 tests) | test_expense_api.py |
| IE-001~IE-006, IE-008 | `TestExpenseAPI` (19 tests) | test_expense_api.py |
| ID-001 (支出) + ID-002 | `TestExpenseDataIsolation` (6 tests) | test_expense_api.py |
| IE-007 + IE-008 | `TestAPIEdgeCases` (5 tests) | test_api.py |
| Auth Me | `TestAuthMe` (5 tests) | test_api.py |
