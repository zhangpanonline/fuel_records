# Fuel Records — 功能测试清单

> 每次完成一个 Phase 后，补充对应的测试用例。测试时从 Phase 1 按顺序跑到最新 Phase，防止回归。

---

## 测试环境说明

### 本地环境
- 后端: `http://localhost:8000`
- 数据库: SQLite (`DB_TYPE=sqlite`)，文件 `backend/fuel_records.db`

### 线上环境
- 后端: `https://fuel-records.onrender.com`
- 数据库: PostgreSQL (Supabase)，`DB_TYPE=postgresql`

### 测试前准备

```bash
# 本地：清空数据库重新开始
rm -f backend/fuel_records.db

# 启动后端
cd backend && source .venv/bin/activate && uvicorn main:app --host 0.0.0.0 --port 8000 &
cd ..

# 设置变量
BASE="http://localhost:8000/api/v1"
```

---

## Phase 1 — 健康检查

- [ ] `GET /api/v1/health` 返回 `{"status":"ok","version":"1.0.0"}`

---

## Phase 4 — 用户鉴权

### 用户注册

- [ ] 正常注册 → 返回 JWT token
- [ ] 重复用户名 → 返回 400 "已被注册"
- [ ] 密码不足 6 位 → 返回 422

### 用户登录

- [ ] 正确密码 → 返回 JWT
- [ ] 错误密码 → 返回 400 "用户名或密码错误"
- [ ] 不存在用户 → 返回 400 "用户名或密码错误"

### 鉴权拦截

- [ ] 无 Token 访问 `/records` → 401
- [ ] 无效 Token → 401

---

## Phase 5 — 多车管理

### 车辆 CRUD

- [ ] 创建车辆 → 返回 Vehicle 对象
- [ ] 获取车辆列表 → 返回当前用户的车辆
- [ ] 修改车辆名称 → 成功
- [ ] 删除无记录的车辆 → 成功
- [ ] 删除有关联记录的车辆 → 返回 400 错误

### 创建加油记录（含 vehicle_id）

- [ ] 创建第一条记录 → `is_baseline: true`，`fuel_consumption: null`
- [ ] 创建第二条记录 → 自动计算油耗
- [ ] 使用不存在的 vehicle_id → 400 "车辆不存在"
- [ ] 里程倒退 → 400 "里程数不能低于上一条记录"
- [ ] 无 vehicle_id → 422 校验错误

### 按车辆筛选记录

- [ ] `?vehicle_id=1` 只返回该车辆的记录
- [ ] 不同车辆的记录互不干扰

### 数据隔离

- [ ] 用户 A 只能看到自己的车辆
- [ ] 用户 A 只能看到自己的记录
- [ ] 用户 B 不能修改 A 的记录
- [ ] 用户 B 不能删除 A 的记录
- [ ] 用户 B 不能替 A 的车创建记录

### 修改与删除（含车辆维度）

- [ ] 修改记录 → 级联重算该车辆后续油耗
- [ ] 删除基线记录（该车唯一）→ 400 错误
- [ ] 删除中间记录 → 级联重算
- [ ] A 修改自己的记录不影响 B 的油耗

### 前端验证

- [ ] 登录后显示车辆选择器下拉框
- [ ] 首次使用提示添加车辆
- [ ] 添加车辆后自动选中
- [ ] 切换车辆 → 列表刷新为新车辆的记录
- [ ] 刷新页面后记住上次选择的车辆（localStorage）
- [ ] 创建记录自动带当前车辆 ID

---
## Phase 6 — 数据之美

### 统计汇总

- [ ] `GET /api/v1/stats/summary?vehicle_id=X` 返回 record_count / total_mileage / total_fuel_volume / total_fuel_cost / avg_consumption / avg_unit_price
- [ ] 有记录的车辆返回完整统计数据
- [ ] 无记录的车辆返回 record_count=0

### 月度统计

- [ ] `GET /api/v1/stats/monthly?vehicle_id=X&year=2026` 返回按月份分组的加油统计
- [ ] 返回结构含 year + months 数组，每月含 count / total_volume / total_cost / avg_consumption

### 记录筛选

- [ ] `?start_date=2026-01-01&end_date=2026-12-31` 按日期范围筛选
- [ ] `?is_full_tank=true` 筛选加满的记录
- [ ] `?is_full_tank=false` 筛选未加满的记录
- [ ] `?note=中石化` 按备注模糊搜索

### 前端验证

- [ ] 首页显示"统计"按钮，点击跳转统计页面
- [ ] 统计页展示概览卡片（总里程、平均油耗、总花费、总加油量）
- [ ] 统计页有年份选择器
- [ ] 统计页展示月度油耗折线图（油耗 + 花费双轴）
- [ ] 统计页展示月度明细表
- [ ] 首页有"筛选"按钮，展开日期/加满/备注筛选
- [ ] 筛选有红点提示当前激活的筛选条件
- [ ] 应用筛选后列表按条件过滤
- [ ] 清除筛选后恢复全部记录

---

## 已知坑位记录

### 本地 vs 线上差异

| 场景 | 本地 (SQLite) | 线上 (PostgreSQL) | 影响 |
|------|--------------|-------------------|------|
| `server_default=func.now()` | SQLite CURRENT_TIMESTAMP | PostgreSQL NOW() | 时区差异 |
| `unique=True` 对 NULL | 允许多个 NULL | 允许多个 NULL | email 无影响 |
| 连接池 | 无 | 自动连接池 | 线上并发更好 |

### Phase 4 踩坑

1. **passlib 与 bcrypt 5.0 不兼容** → 降级 bcrypt 到 4.x
2. **recaculate_consumption 未过滤 user_id** → 修复加 user_id 参数

### Phase 5 踩坑

1. **delete_record 基线保护按全用户检查** → 改为按 vehicle_id 检查，防止用户有 A、B 两车时，删 A 的基线记录被 B 拦截
2. **create_all 不改已有表结构** → 添加 _migrate_add_column() 自动迁移 vehicle_id 列

---

> **更新记录**
> - 2026-07-30: Phase 6 更新 — 统计汇总 API + 月度统计 API + 记录筛选 + 前端统计页面（卡片/折线图/明细表）+ 前端筛选面板
> - 2026-07-29: Phase 5 更新 — 车辆 CRUD + vehicle_id 关联 + 多车数据隔离测试用例
> - 2026-07-29: 初版，覆盖 Phase 1-4 所有功能测试 + 踩坑记录
