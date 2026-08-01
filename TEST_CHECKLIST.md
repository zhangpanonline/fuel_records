# Fuel Records — 功能测试清单

> 每次完成一个 Phase 后，补充对应的测试用例。测试时从 Phase 1 按顺序跑到最新 Phase，防止回归。

---

## 测试环境说明

> [!CAUTION]
> **线上手动测试必须使用测试数据库（`postgresql_test`），禁止碰生产数据库。**
> 生产数据库（`DB_PG_URL`）仅用于 Render 部署环境，不在本地或其他环境直连测试。

### 本地环境
- 后端: `http://localhost:8000`
- 数据库: SQLite (`DB_TYPE=sqlite`)，文件 `backend/fuel_records.db`

### 线上测试环境
- 数据库: Supabase 测试项目 (`fuel-records-test`)，`DB_TYPE=postgresql_test`
- 连接串: `DB_PG_URL_TEST` 指向独立测试数据库，与生产数据完全隔离
- 使用方法: 修改 `.env` 第一行为 `DB_TYPE=postgresql_test`，启动后端即可

### 线上生产环境
- 后端: `https://fuel-records.onrender.com`
- 数据库: Supabase 生产项目，`DB_TYPE=postgresql`
- **仅 Render 部署自动使用，严禁本地手动连接**

### 测试前准备

```bash
# 本地 SQLite 测试（日常开发）
rm -f backend/fuel_records.db
cd backend && source .venv/bin/activate && uvicorn main:app --host 0.0.0.0 --port 8000 &
cd ..
BASE="http://localhost:8000/api/v1"
```

```bash
# 线上测试库（需要真数据验证时）
# 1. 修改 backend/.env: DB_TYPE=postgresql_test
# 2. 确保 DB_PG_URL_TEST 已配置测试 Supabase 项目连接串
# 3. 启动后端同上
# 注意: 测试库和生产库完全隔离，可随意增删改
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
## Phase 10 — 个人记账

### 分类管理 API

- [ ] `POST /api/v1/expenses/categories` 创建一级分类（无 parent_id）→ 201，level=1
- [ ] `POST /api/v1/expenses/categories` 创建二级分类（指定 parent_id）→ 201，level=2
- [ ] `POST /api/v1/expenses/categories` 创建三级分类 → 201，level=3
- [ ] `POST /api/v1/expenses/categories` 尝试创建 level=4 → 400
- [ ] `POST /api/v1/expenses/categories` 同名同级 → 409
- [ ] `GET /api/v1/expenses/categories` 返回用户分类树（含 children 嵌套）
- [ ] `PUT /api/v1/expenses/categories/{id}` 修改名称 → 成功
- [ ] `PUT /api/v1/expenses/categories/{id}` 不传 parent_id（禁止改层级）→ 校验通过
- [ ] `DELETE /api/v1/expenses/categories/{id}` 删除无子分类无记录的 → 204
- [ ] `DELETE /api/v1/expenses/categories/{id}` 有子分类 → 400
- [ ] `DELETE /api/v1/expenses/categories/{id}` 有关联记录 → 400

### 支出记录 API

- [ ] `POST /api/v1/expenses` 创建支出（完整三级分类）→ 201
- [ ] `POST /api/v1/expenses` 无效分类链（L1→L2→L3 不匹配）→ 400
- [ ] `POST /api/v1/expenses` 金额 ≤ 0 → 422
- [ ] `GET /api/v1/expenses` 分页返回（page + page_size）→ items + total
- [ ] `GET /api/v1/expenses?start_date=...&end_date=...` 日期筛选
- [ ] `GET /api/v1/expenses?category_l1=餐饮` 按一级分类筛选
- [ ] `PUT /api/v1/expenses/{id}` 修改金额/备注 → 200
- [ ] `PUT /api/v1/expenses/{id}` 尝试改到不存在的分类 → 400
- [ ] `DELETE /api/v1/expenses/{id}` 删除 → 204
- [ ] `DELETE /api/v1/expenses/{id}` 删除不存在的记录 → 404

### 统计 API

- [ ] `GET /api/v1/expenses/stats?start_date=...&end_date=...&group_by=none` 返回 total_amount / record_count / avg_daily + category_breakdown 扁平列表
- [ ] `GET /api/v1/expenses/stats?group_by=month` 返回 items 数组（含 period + total + breakdown）
- [ ] `GET /api/v1/expenses/stats?group_by=none&category_l1=餐饮` 按分类过滤统计

### 数据隔离

- [ ] 用户 A 创建分类 → 用户 B 看不到
- [ ] 用户 A 创建支出 → 用户 B 看不到
- [ ] 用户 B 不能修改 A 的支出
- [ ] 用户 B 不能删除 A 的支出
- [ ] 用户 B 不能修改 A 的分类

### 全局导航

- [ ] 底部导航双 Tab：油耗 / 记账，点击切换页面
- [ ] 顶栏显示 App 名称 + 主题切换 + 退出按钮
- [ ] 主题切换（亮色/暗色/自动）两个 Tab 共享状态
- [ ] `/` 自动重定向到 `/fuel`
- [ ] `/stats` 自动重定向到 `/fuel/stats`
- [ ] `/login` 页面不显示导航栏

### 记账主页

- [ ] 金额输入大号 `¥` 前缀，移动端弹出数字键盘
- [ ] 三级分类级联选择器（L1→L2→L3）正常联动
- [ ] 选择器末尾"+ 新建"弹出快速创建弹窗
- [ ] 冷启动（无分类）显示"创建你的第一个分类"引导
- [ ] 日期默认当天，可修改
- [ ] 提交按钮正常创建记录 → 列表刷新
- [ ] 编辑按钮 → 回填表单 → 按钮变"更新记录"
- [ ] 删除按钮 → confirm → 记录消失
- [ ] 左滑显示红色"删除"背景
- [ ] "加载更多"按钮加载下一页
- [ ] 列表为空显示"还没记过账"

### 底部弹出面板 — 分类管理

- [ ] 分类树形展示（一级→二级→三级），可展开折叠
- [ ] 重命名：内联编辑，Enter 保存
- [ ] 添加子分类：展开后"+ 添加子分类"
- [ ] 删除分类：有子分类 → 提示"先删除子分类"

### 底部弹出面板 — 统计图表

- [ ] 汇总卡片：总支出 / 笔数 / 日均
- [ ] 饼图：显示一级分类占比 + 百分比标签
- [ ] 饼图下钻：点击扇区 → 进入二级 → 点击 → 进入三级 + 返回按钮
- [ ] 堆叠柱状图：按月份 + 一级分类堆叠
- [ ] 旭日环形图：一级分类环形占比
- [ ] 时间切换：本月 / 本年 / 近一周
- [ ] 无数据时图表区域显示占位提示

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
> - 2026-07-31: Phase 10 新增 — 个人记账模块测试清单（分类管理 / 支出记录 / 统计 / 数据隔离 / 全局导航 / 记账主页 / 底部面板 / 统计图表 共 40+ 条测试）
> - 2026-07-30: Phase 6 更新 — 统计汇总 API + 月度统计 API + 记录筛选 + 前端统计页面（卡片/折线图/明细表）+ 前端筛选面板
> - 2026-07-29: Phase 5 更新 — 车辆 CRUD + vehicle_id 关联 + 多车数据隔离测试用例
> - 2026-07-29: 初版，覆盖 Phase 1-4 所有功能测试 + 踩坑记录
