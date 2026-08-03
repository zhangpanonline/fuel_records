# Fuel Records — 摩托车油耗记录 + 个人记账 App

> **本项目的架构设计和代码风格参考了 [`company.md`](file:///Users/zp/Code/fuel_records/company.md)（公司项目「井下作业智能体」）的技术栈与分层架构，旨在通过一个麻雀虽小五脏俱全的实操项目，系统学习后端开发知识。**
>
> **新增功能**：个人记账模块，详见 [`EXPENSE_SPEC.md`](file:///Users/zp/Code/fuel_records/EXPENSE_SPEC.md)。
>
> **性能优化**：前端 CSS 降级（性能模式开关）+ 后端 Render → Fly.io 迁移，详见 [`PERF_SPEC.md`](file:///Users/zp/Code/fuel_records/PERF_SPEC.md)。

---

## 1. 核心目标

### 业务目标
- **油耗记录**：为我的 KPT400 摩托车（当前里程约 52000 km）提供一个**真实可用的油耗记录工具**，支持记录加油数据、自动计算平均油耗、统计总金额和总油耗，支持多车管理。
- **个人记账**：追踪日常支出，支持自定义三级分类、三环旭日图/堆叠柱状图（图例下钻）/饼图下钻等多维度可视化分析。

### 学习目标
通过手把手逐行写代码的方式，从零掌握以下后端技能：

> **教学承诺**：每一行代码都会讲解为什么这么写，每个概念都会从零开始解释清楚再动手。不跳步，不默认你懂任何前置知识。写完一个 Ticket 后，我会明确问你"这个 Ticket 的所有内容你都完全理解了吗？"，你说"理解了"我才进下一个——绝不自作主张帮你跳到下一关。
>
> **知识沉淀**：每个 Ticket 完成后，我会同步更新 [`DIR.md`](file:///Users/zp/Code/fuel_records/DIR.md)，详细说明本次新增或修改的每个目录和文件是做什么的、关键函数是什么、为什么这么设计。你任何时候回头看 `DIR.md`，就能快速回忆起整个项目的结构和设计意图。
- **API 设计**：FastAPI 路由、请求/响应模型
- **数据库操作**：MySQL + SQLAlchemy ORM、表设计、CRUD
- **数据校验**：Pydantic 模型
- **日志**：loguru 结构化日志
- **认证鉴权**：JWT（PyJWT）
- **部署运维**：Render + Supabase、Docker + docker-compose、Linux 基础运维
- **容器化**：Dockerfile、多容器编排
- **CI/CD**（后期）：自动化部署流水线

### 对齐目标
本项目力求在技术选型、分层架构、代码风格上对齐公司项目 [`company.md`](file:///Users/zp/Code/fuel_records/company.md) 的标准，使得学完本项目后能平滑融入公司项目开发。

---

## 2. 技术栈

| 类别 | 技术 | 版本 | 公司对标 |
|------|------|------|---------|
| 语言 | Python | 3.12 | ✅ 对齐 |
| Web 框架 | FastAPI + Uvicorn | latest | ✅ 对齐 |
| 数据库 | SQLite / PostgreSQL / MySQL | 本地/部署/Docker | ✅ 对齐（公司 MySQL，本项目兼容三种） |
| ORM | SQLAlchemy | 2.x | ✅ 对齐 |
| 数据校验 | Pydantic | 2.x | ✅ 对齐 |
| 日志 | loguru | latest | ✅ 对齐 |
| 认证 | PyJWT | latest | ✅ 对齐 |
| 部署 | Render + Supabase | latest | ✅ 对齐（公司 Docker 部署，Render 自动容器化） |
| 前端 | React + Capacitor | latest | 你已掌握 React，Capacitor 将网页包为 APK |

**不涉及的**：AI/ML、LLM、SSE、定时任务、缓存层——这些是公司业务特有，本 app 不需要。

---

## 3. 系统架构

### 3.1 整体架构图

```
┌─────────────────────────────────────────────────────┐
│                   Entry Layer                       │
│           main.py (Uvicorn + 模块初始化)              │
├─────────────────────────────────────────────────────┤
│                  Web Layer                           │
│  ┌───────────────────────────────────────────────┐  │
│  │           REST API Routers                     │  │
│  │  /api/v1/records  ─  加油记录 CRUD             │  │
│  │  /api/v1/auth     ─  用户认证                  │  │
│  │  /api/v1/vehicles ─  车辆管理                  │  │
│  │  /api/v1/stats    ─  统计数据                  │  │
│  │  /api/v1/expenses ─  记账模块 (P10)             │  │
│  └───────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────┤
│                 Business Layer                       │
│  ┌───────────────────────────────────────────────┐  │
│  │          Service Layer (业务逻辑)               │  │
│  │  record_service.py ─ 油耗计算引擎              │  │
│  │  auth_service.py   ─  JWT 鉴权               │  │
│  │  vehicle_service.py ─ 车辆管理                 │  │
│  │  stats_service.py  ─  统计聚合                 │  │
│  │  expense_service.py ─ 记账业务 (P10)           │  │
│  │  expense_stats_service.py ─ 记账统计 (P10)     │  │
│  └───────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────┤
│                 Data Layer                           │
│  ┌──────────────────────┐ ┌──────────────────────┐  │
│  │    Models (ORM)      │ │    Database           │  │
│  │  User, Vehicle,      │ │  SQLAlchemy Session   │  │
│  │  FuelRecord, Expense, │ │  Connection Pool      │  │
│  │  ExpenseCategory      │ │                       │  │
│  └──────────────────────┘ └──────────────────────┘  │
├─────────────────────────────────────────────────────┤
│               Foundation Layer                       │
│  ┌──────────┐ ┌──────────┐ ┌────────────────────┐  │
│  │  Config  │ │  Auth    │ │  Logger (loguru)    │  │
│  │  (.env)  │ │(JWT中间件)│ │                    │  │
│  └──────────┘ └──────────┘ └────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 3.2 目录结构

```
fuel_records/
├── backend/                    # 后端代码
│   ├── main.py                 # 入口：Uvicorn 启动 + 路由挂载
│   ├── config.py               # 配置管理（.env 读取）
│   ├── database.py             # 数据库连接（SQLAlchemy engine + session）
│   ├── logger.py               # loguru 日志配置
│   ├── models/                 # ORM 模型
│   │   ├── user.py             # User 模型（P4）
│   │   └── fuel_record.py      # FuelRecord 模型（P1，含 user_id 外键 P4）
│   ├── schemas/                # Pydantic 请求/响应模型
│   │   ├── record.py
│   │   └── auth.py             # 注册/登录 Schema（P4）
│   ├── routers/                # API 路由
│   │   ├── records.py
│   │   └── auth.py             # 注册/登录路由（P4）
│   ├── services/               # 业务逻辑层
│   │   ├── record_service.py   # 油耗计算核心逻辑
│   │   └── auth_service.py     # 认证逻辑（P4）
│   ├── core/                   # 基础设施
│   │   ├── security.py         # bcrypt 密码哈希 + JWT 签发/验证（P4）
│   │   └── deps.py             # FastAPI 依赖注入（get_current_user）（P4）
│   ├── alembic/                # 数据库迁移（后期引入）
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/                   # React + Capacitor 前端
│   ├── src/                    # React 源码
│   │   ├── pages/              # 页面组件
│   │   │   ├── LoginPage.tsx   # 登录/注册
│   │   │   ├── ExpensePage.tsx  # 记账主页 (P10)
│   │   │   └── ExpenseStatsPage.tsx  # 记账统计 (P10)
│   │   ├── components/         # 通用组件
│   │   │   ├── TopBar.tsx      # 全局顶栏 (P10)
│   │   │   ├── BottomNav.tsx   # 底部双Tab导航 (P10)
│   │   │   ├── SmartFAB.tsx    # 智能浮动按钮 (P10.5)
│   │   │   ├── CategoryPicker.tsx  # 合并三级选择器 (P10.5)
│   │   │   ├── PullToRefresh.tsx  # 下拉刷新 (P10.6)
│   │   │   ├── ExpenseSummaryCards.tsx  # 六区间统计卡片 (P10.6)
│   │   │   ├── ExpensePageSkeleton.tsx  # 记账骨架屏 (P10.6)
│   │   │   └── FuelPageSkeleton.tsx  # 油耗骨架屏 (P10.6)
│   │   ├── context/            # React Context (P10.5)
│   │   │   ├── FuelDataContext.tsx  # 加油数据共享
│   │   │   └── ExpenseDataContext.tsx  # 记账数据共享
│   │   ├── services/           # API 调用
│   │   │   ├── api.ts          # 全部 API 函数
│   │   │   ├── upgrade.ts      # 版本更新检测 (P9)
│   │   │   └── upgrade.md       # 版本更新规格书
│   │   ├── App.tsx             # 加油主页面
│   │   └── main.tsx            # 路由入口 + DataProviders (P10.6)
│   ├── capacitor-config/       # Capacitor 原生配置
│   ├── package.json
│   └── vite.config.ts
├── docker-compose.yml          # 多容器编排（FastAPI + MySQL）
├── .env                        # 环境配置（不上仓库）
├── .gitignore
├── .env.example
├── .dockerignore
├── runtime.txt
├── company.md                  # 公司项目架构参考
├── README.md                   # 本文件 — 项目规格书
├── README.tickets.md           # 任务拆解清单
├── DIR.md                      # 目录结构说明
├── TEST_CHECKLIST.md           # 功能测试清单（每次更新后逐项验证）
├── test_all.sh                 # 一键自动化测试脚本
├── docker-compose.yml          # Docker 编排（本地开发用）
```

---

## 4. 数据库设计

### 4.1 表结构

#### users（用户表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INT | PK, AUTO_INCREMENT | 用户ID |
| username | VARCHAR(50) | UNIQUE, NOT NULL | 用户名 |
| email | VARCHAR(100) | UNIQUE | 邮箱 |
| hashed_password | VARCHAR(255) | NOT NULL | 密码哈希（bcrypt） |
| is_active | BOOLEAN | DEFAULT TRUE | 是否激活 |
| created_at | DATETIME | DEFAULT NOW | 创建时间 |
| updated_at | DATETIME | ON UPDATE NOW | 更新时间 |

#### vehicles（车辆表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INT | PK, AUTO_INCREMENT | 车辆ID |
| user_id | INT | FK → users.id | 所属用户 |
| name | VARCHAR(50) | NOT NULL | 车辆名称（如 "KPT400"） |
| plate | VARCHAR(20) | 可选 | 车牌号 |
| initial_mileage | DECIMAL(10,1) | NOT NULL | 初始里程（首次记录时的里程） |
| is_active | BOOLEAN | DEFAULT TRUE | 是否启用 |
| created_at | DATETIME | DEFAULT NOW | 创建时间 |

#### fuel_records（加油记录表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INT | PK, AUTO_INCREMENT | 记录ID |
| vehicle_id | INT | FK → vehicles.id | 所属车辆 |
| user_id | INT | FK → users.id | 所属用户 |
| mileage | DECIMAL(10,1) | NOT NULL | 当前里程表读数（km） |
| fuel_volume | DECIMAL(10,2) | NOT NULL | 加油量（L） |
| fuel_cost | DECIMAL(10,2) | NOT NULL | 加油金额（元） |
| unit_price | DECIMAL(10,2) | 计算字段 | 单价 = 金额 ÷ 油量 |
| is_full_tank | BOOLEAN | DEFAULT TRUE | 是否加满 |
| is_baseline | BOOLEAN | DEFAULT FALSE | 是否为基线记录（不计算油耗） |
| fuel_consumption | DECIMAL(5,2) | NULLABLE | 百公里油耗（L/100km） |
| note | TEXT | NULLABLE | 备注（如 "中石化XX站"） |
| record_date | DATETIME | DEFAULT NOW | 记录时间 |
| created_at | DATETIME | DEFAULT NOW | 创建时间 |

### 4.2 油耗计算算法

```
条件：仅当 is_full_tank = TRUE 且 is_baseline = FALSE 时计算

fuel_consumption = (当前里程 - 上一条记录的里程) / 当前加油量 × 100

结果单位：L/100km

首次记录（无前一条数据）= 基线记录（is_baseline = TRUE），不计算油耗
```

### 4.3 索引设计

| 表 | 索引字段 | 目的 |
|---|---|---|
| fuel_records | (vehicle_id, record_date) | 按车辆+时间排序查询 |
| fuel_records | (user_id, vehicle_id) | 用户查询某车辆的全部记录 |
| vehicles | (user_id) | 查询用户的所有车辆 |

---

## 5. API 设计

### 5.1 健康检查

```
GET /api/v1/health
→ 200 { "status": "ok", "version": "1.0.0" }
```

### 5.2 加油记录 API

```
POST /api/v1/records         创建加油记录
GET  /api/v1/records         获取记录列表（分页）
GET  /api/v1/records/{id}    获取单条记录
PUT  /api/v1/records/{id}    修改记录
DEL  /api/v1/records/{id}    删除记录
```

**POST /api/v1/records 请求体**：

```json
{
  "vehicle_id": 1,
  "mileage": 52345.5,
  "fuel_volume": 12.5,
  "fuel_cost": 98.75,
  "is_full_tank": true,
  "note": "中石化XX站"
}
```

**响应**：

```json
{
  "id": 1,
  "vehicle_id": 1,
  "mileage": 52345.5,
  "fuel_volume": 12.5,
  "fuel_cost": 98.75,
  "unit_price": 7.9,
  "is_full_tank": true,
  "is_baseline": false,
  "fuel_consumption": 3.2,
  "note": "中石化XX站",
  "record_date": "2026-07-19T14:30:00"
}
```

**GET /api/v1/records 查询参数**：

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| vehicle_id | int | 必填 | 车辆ID |
| page | int | 1 | 页码 |
| page_size | int | 20 | 每页条数 |
| start_date | str | 可选 | 开始日期（筛选） |
| end_date | str | 可选 | 结束日期（筛选） |

### 5.3 统计 API（Phase 6 + P10 重构）

```
GET /api/v1/stats/summary?vehicle_id=1&start_date=2026-07-01&end_date=2026-08-01    总里程、总油耗、总金额、平均油耗（支持日期范围筛选）
GET /api/v1/stats/monthly?vehicle_id=1&start_date=2026-07-01&end_date=2026-08-01    按月统计（支持日期范围筛选）
GET /api/v1/stats/timeline?vehicle_id=1&group_by=day&start_date=2026-07-30&end_date=2026-08-01    时间线统计（P10 新增：group_by=day|week|month 智能粒度）
```

### 5.4 用户认证 API（Phase 4）

```
POST /api/v1/auth/register    注册（返回 JWT）
POST /api/v1/auth/login       登录 → 返回 JWT
```

### 5.5 车辆管理 API（Phase 5）

```
POST /api/v1/vehicles         添加车辆
GET  /api/v1/vehicles         我的车辆列表
PUT  /api/v1/vehicles/{id}    修改车辆信息
DEL  /api/v1/vehicles/{id}    删除车辆
```

### 5.6 记账模块 API（P10 / P10.6）

```
POST   /api/v1/expenses                 创建支出记录
GET    /api/v1/expenses                 分页查询记录列表
PUT    /api/v1/expenses/{id}            修改记录
DELETE /api/v1/expenses/{id}            删除记录
POST   /api/v1/expenses/categories      创建分类
GET    /api/v1/expenses/categories      获取分类树
PUT    /api/v1/expenses/categories/{id} 修改分类
DELETE /api/v1/expenses/categories/{id} 删除分类
GET    /api/v1/expenses/stats           多维度统计（group_by + 分类过滤）
GET    /api/v1/expenses/multi_summary   六区间累计金额（P10.6 新增：当年/当月/当周/近一年/近一月/近一周）
```

---

## 6. 分阶段迭代计划

### Phase 1 — "Hello 油耗"（最小可用版）

**目标**：在手机上真正开始记录 KPT400 的加油数据。

**后端工作**：
- 搭建 FastAPI 项目骨架（分层目录结构）
- 配置 MySQL 数据库连接（SQLAlchemy）
- 创建 `fuel_records` 表（无用户、无车辆的概念，单表）
- 实现 **2 个 API**：
  - `POST /api/v1/records` — 创建记录
  - `GET /api/v1/records` — 查看所有记录
- 油耗计算逻辑（基线处理 + 百公里油耗计算）
- loguru 日志配置

**前端工作**：
- 初始化 React + Vite 项目
- 一个页面：顶部表单（里程输入 + 油量输入 + 金额输入 + 提交按钮）+ 底部记录列表
- 调通后端 API
- 集成 Capacitor，打包 APK 安装到手机

**部署**：
- Dockerfile + docker-compose（本地开发用）
- Render + Supabase 线上部署（免费托管 + 免费 PostgreSQL）

**学到的知识点**：
1. FastAPI 路由定义（`@app.get`, `@app.post`）
2. SQLAlchemy 表定义与 Session 管理
3. Pydantic 请求/响应模型
4. React 页面搭建 + fetch API 调用
5. Capacitor 打包 APK 流程
6. Docker 基本命令 + docker-compose 编排

**交付物**：一个可安装到华为 Mate40 Pro 的 app，能真实录数据

---

### Phase 2 — "CRUD 完整版"

**目标**：完善增删改查，支持修改和删除记录。

**新增工作**：
- `PUT /api/v1/records/{id}` — 修改记录
- `DELETE /api/v1/records/{id}` — 删除记录（含关联油耗重新计算）
- 前端：记录支持编辑和删除

**学到的知识点**：
1. FastAPI 路径参数
2. SQLAlchemy Update / Delete 操作
3. 修改基线记录对后续油耗计算的级联影响

---

### Phase 3 — "上云"

**目标**：从本地开发转移到线上部署。

**新增工作**：
- 注册 Supabase 创建 PostgreSQL 数据库
- 注册 Render 并连接 GitHub 仓库
- 一键自动部署（Git push 触发自动构建）
- Render 自动配置 HTTPS（SSL 证书自动管理）

**学到的知识点**：
1. Render 平台部署流程
2. Supabase 数据库管理（网页 Dashboard）
3. 环境变量配置与自动部署

---

### Phase 4 — "用户来了"（鉴权）✅

**目标**：引入用户系统，保护数据安全。

**已完成工作**：
- 创建 `users` 表 + User ORM 模型
- JWT 签发与验证（`core/security.py`）
- 密码哈希（bcrypt + 12 轮迭代）
- 注册 / 登录 API（`POST /api/v1/auth/register`, `POST /api/v1/auth/login`）
- FastAPI `get_current_user` 依赖注入（`core/deps.py`）
- 所有 `/records` 接口加 JWT 鉴权 + 按 `user_id` 数据隔离
- 前端：登录/注册页面（Tab 切换）、axios 拦截器（自动带 token + 401 跳转）、React Router 路由守卫
- 测试：TEST_CHECKLIST.md + test_all.sh 一键自动化测试

**学到的知识点**：
1. 密码哈希（bcrypt）
2. JWT 原理（access token）
3. FastAPI 依赖注入系统
4. 前端 Token 持久化
5. 前后端联调鉴权流程

---

### Phase 5 — "多车管理" ✅

**目标**：支持摩托车 + 汽车分别记录。

**已完成工作**：
- 创建 `vehicles` 表（id, user_id, name, plate, initial_mileage, is_active）
- 车辆 CRUD API（POST/GET/PUT/DELETE `/api/v1/vehicles`）
- 加油记录关联 vehicle_id
- 油耗计算按车辆分组独立
- 删除车辆校验无关联记录
- 前端：车辆下拉选择器 + 添加车辆表单 + localStorage 记忆
- 数据库自动迁移 `_migrate_add_column()`

**学到的知识点**：
1. 多表关联查询
2. SQLAlchemy 关系映射（relationship）
3. React 页面导航与状态管理

---

### Phase 6 — "数据之美"

**目标**：统计数据可视化。

**新增工作**：
- 统计 API（总里程、总油耗、总金额、平均油耗）
- 月度统计接口
- 前端：统计页面、图表（Recharts）
- P10.6 新增：油耗页累计统计下拉框（当年/当月/自上月累计油耗+金额，localStorage 记忆选择）

**学到的知识点**：
1. SQLAlchemy 聚合查询（group_by、func）
2. 数据清洗与聚合逻辑
3. Recharts 图表组件使用

---

### Phase 7 — "生产级"

**目标**：代码质量与运维。

**新增工作**：
- Alembic 数据库迁移
- 单元测试（pytest）
- CI/CD（GitHub Actions 自动部署）
- 日志轮转与监控
- API 版本管理

---

### Phase 8 — "锦上添花"

**目标**：用户体验完善。

**新增工作**：
- 数据导出（CSV / Excel）
- 暗黑模式
- 性能优化
- App 版本更新检测与自动安装（Supabase Storage 托管 APK → 启动检测 → 下载 → 系统安装器）→ 规格书：[`upgrade.md`](file:///Users/zp/Code/fuel_records/frontend/src/services/upgrade.md)

> [!CAUTION]
> **自动更新是本 App 的生命线**。App 无应用商店分发渠道，一旦自动更新功能被破坏，用户将永久停留在旧版本且无法联系到开发者。详见 [`TEST_CHECKLIST.md 自动更新保护章节`](file:///Users/zp/Code/fuel_records/TEST_CHECKLIST.md)。

- **已移除**：加油提醒推送（Phase 10.5 移除）、统计截图分享（Phase 10.5 移除）

---

## 7. 边界条件与异常处理

### 7.1 油耗计算边界

| 场景 | 处理方式 |
|------|---------|
| 首次加油（无前一条记录） | 标记 `is_baseline=true`，不计算油耗，显示"基线记录，下次加油后显示油耗" |
| 非加满加油 | `is_full_tank=false`，不参与油耗计算，仅记录金额和油量 |
| 修改/删除中间记录 | 级联重新计算受影响的后继记录的油耗 |
| 里程未增加反而减少 | 提示"里程不能低于上一条记录"，拒绝提交 |
| 油量或金额为 0 或负数 | Pydantic 校验拦截 |
| 油量超出合理范围（> 50L） | 警告但允许（KPT400 油箱约 15L，汽车约 50L） |

### 7.2 API 异常处理

| 异常 | HTTP Status | 响应体 |
|------|------------|--------|
| 记录不存在 | 404 | `{"detail": "记录不存在"}` |
| 参数校验失败 | 422 | Pydantic 自动错误格式 |
| Token 过期 | 401 | `{"detail": "Token 已过期"}` |
| 权限不足 | 403 | `{"detail": "无权操作此记录"}` |
| 服务器内部错误 | 500 | `{"detail": "服务器内部错误"}` (不暴露堆栈) |

### 7.3 前端防御

| 场景 | 处理 |
|------|------|
| 网络超时 | 显示加载状态，超时提示重试 |
| 提交中重复点击 | 按钮 disabled，防止重复提交 |
| 列表为空 | 显示空状态插图 + "还没记录，去加一箱油吧" |
| API 返回错误 | 底部 SnackBar 提示错误信息 |
| 输入框验证 | 实时校验（里程必须为数字 > 0） |

---

## 8. 对齐公司架构对照表

| 维度 | 公司项目 | 本项目 | 对齐策略 |
|------|---------|--------|---------|
| 入口层 | server.py (Uvicorn) | main.py (Uvicorn) | 同一模式 |
| Web 接口层 | 20+ 路由模块 | routers/ 按业务拆分 | 结构对齐 |
| 业务处理层 | 消息模块 + 服务模块 | services/ 层 | 服务层模式对齐 |
| 数据访问层 | SQLAlchemy + 自定义SQL | SQLAlchemy ORM | ORM 层对齐 |
| 基础层 | Auth + Config + Tools | core/ (auth, config, deps) | 结构对齐 |
| 日志 | loguru | loguru | 完全一致 |
| 部署 | Docker | Docker + docker-compose | Docker 对齐 |

---

## 9. 学习路径图

```
Phase 1 ──→  FastAPI 入门 + React 入门 + MySQL 基础 + Capacitor APK
   │
Phase 2 ──→  CRUD 进阶 + SQLAlchemy 熟练
   │
Phase 3 ──→  Render + Supabase 部署 + 自动 HTTPS（最陡的一期？不，比 VPS 简单多了）
   │
Phase 4 ──→  JWT + 密码学基础 + 依赖注入
   │
Phase 5 ──→  多表关联 + React 状态管理
   │
Phase 6 ──→  聚合查询 + 图表可视化
   │
Phase 7 ──→  测试 + 迁移 + CI/CD（生产技能）
   │
Phase 8 ──→  用户体验锦上添花
```

每一期都是**可运行的交付物**，你在手机上能打开 app 看到真实数据。

---

> **本规格书对应的公司项目架构参考位于 [`company.md`](file:///Users/zp/Code/fuel_records/company.md)**
>
> **新增模块规格书**：[`EXPENSE_SPEC.md`](file:///Users/zp/Code/fuel_records/EXPENSE_SPEC.md) — 个人记账功能（自定义三级分类 + 三环旭日图/堆叠柱状图下钻/饼图下钻多维度统计）
>
> **性能优化规格书**：[`PERF_SPEC.md`](file:///Users/zp/Code/fuel_records/PERF_SPEC.md) — 前端 CSS 降级（性能模式开关）+ 后端 Render → Fly.io 迁移
