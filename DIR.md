```text
fuel_records/
│
├── .env                          # 环境变量配置（不上 Git）
│                                 # └ DB_TYPE=sqlite（本地）/ postgresql（部署）
│
├── .env.example                  # .env 模板，供其他人参考
│
├── .gitignore                    # Git 忽略规则
│
├── runtime.txt                   # Render 部署用：指定 Python 3.12 版本
│
├── README.md                     # 项目规格书：架构、数据库设计、API、迭代计划
│
├── EXPENSE_SPEC.md               # 记账模块规格书（P10 新增）
│                                 # └ 数据模型/API/前端/边界/依赖完整设计（经 13 轮审查、35 项修正）
│
├── README.tickets.md             # 任务拆解清单：10 个 Phase 的原子 Ticket，教学进度
│
├── DIR.md                        # 本文件：目录结构说明
│
├── company.md                    # 公司项目架构参考，本项目对齐目标
│
├── docker-compose.yml            # Docker 编排（FastAPI + MySQL），仅本地开发/自建服务器用
│                                 # 线上部署使用 Render + Supabase（免费替代方案）
│                                 # Render URL: https://fuel-records.onrender.com
│
├── backend/                      # 后端代码（FastAPI + SQLAlchemy）
│   │
│   ├── main.py                   # 入口文件：创建 FastAPI 实例、挂载中间件/路由、启动服务
│   │                             # 关键函数：lifespan（启动时 init_db）、health_check
│   │                             # 路由：records, auth, vehicles, stats, expenses, expense_categories（P10 新增后两者）
│   │                             # 已注册路由：GET /api/v1/health, /api/v1/records/*, /api/v1/auth/*, /api/v1/vehicles/*, /api/v1/stats/*, /api/v1/expenses/*
│   │
│   ├── config.py                 # 配置管理：读取 .env，提供 Settings 单例
│   │                             # 关键类：Settings(BaseSettings)
│   │                             # 支持 DB_TYPE：sqlite（本地开发）/ postgresql（Render+Supabase部署）/ mysql（Docker 自建）
│   │                             #        DB_PG_URL → Supabase/PostgreSQL 连接串（部署用）
│   │
│   ├── database.py               # 数据库连接管理
│   │                             # 关键对象：prod_engine / test_engine（P11 双引擎）、SessionLocal（会话工厂）
│   │                             #          Base（ORM 基类）
│   │                             # 关键函数：init_db()（P7 改用 Alembic upgrade head，P11 对双库同时迁移）
│   │                             #          get_db()（依赖注入，P11 按 X-Database-Env 头选择 Session）
│   │
│   ├── logger.py                 # 日志配置：loguru
│   │                             # 关键函数：setup_logger()
│   │                             # 行为：控制台彩色输出 + 文件输出（10MB 轮转、30 天保留）
│   │
│   ├── requirements.txt          # Python 依赖列表
│   │                             # └ 新增 psycopg2-binary（PostgreSQL 驱动，部署用）
│   │
│   ├── .venv/                    # Python 虚拟环境（本地开发用，不上 Git）
│   │
│   ├── logs/                     # 日志文件目录（自动创建）
│   │   └── fuel_records.log      # 当前日志文件
│   │
│   ├── models/                   # ORM 模型层：定义数据库表结构
│   │   ├── __init__.py           # Python 包标记
│   │   ├── user.py               # User 模型：用户表（P4 新增）
│   │   │                         # └ 字段：id, username(unique), email(unique),
│   │   │                         #          hashed_password, is_active, created_at, updated_at
│   │   │                         # └ 关系：records → FuelRecord（一对多）, vehicles → Vehicle（一对多，P5 新增）
│   │   │                         #         expenses → Expense（一对多，P10 新增）, categories → ExpenseCategory（一对多，P10 新增）
│   │   ├── fuel_record.py        # FuelRecord 模型：加油记录表
│   │   │                         # └ 字段：id, user_id(FK), vehicle_id(FK, P5新增), mileage, fuel_volume, fuel_cost,
│   │   │                         #          unit_price, is_full_tank, is_baseline,
│   │   │                         #          fuel_consumption, note, record_date, created_at
│   │   │                         # └ 关系：user → User（多对一）, vehicle → Vehicle（多对一，P5 新增）
│   │   ├── vehicle.py            # Vehicle 模型：车辆表（P5 新增）
│   │   │                         # └ 字段：id, user_id(FK), name, plate(可选),
│   │   │                         #          initial_mileage, is_active, created_at
│   │   │                         # └ 关系：user → User（多对一）, records → FuelRecord（一对多）
│   │   ├── expense.py            # Expense 模型：支出记录表（P10 新增）
│   │   │                         # └ 字段：id, user_id(FK), amount(>0), category_l1/l2/l3(冗余快照),
│   │   │                         #          note, expense_date, created_at, updated_at
│   │   │                         # └ 关系：user → User（多对一）
│   │   └── expense_category.py   # ExpenseCategory 模型：分类表（P10 新增）
│   │                             # └ 字段：id, user_id(FK), parent_id(FK→self), name, level(1/2/3),
│   │                             #          sort_order, created_at, updated_at
│   │                             # └ 关系：user → User（多对一）, parent/children → 自引用树形结构
│   │
│   ├── schemas/                  # Pydantic Schema 层：API 请求/响应数据格式
│   │   │                         # └ P8.4 统一：X | None → Optional[X]（Python 3.9 兼容）
│   │   ├── __init__.py           # Python 包标记
│   │   ├── record.py             # 加油记录 Schema
│   │   │                         # ├ FuelRecordCreate → 创建记录（含 vehicle_id，P5 新增）
│   │   │                         # ├ FuelRecordResponse → 响应格式（含 id, user_id, vehicle_id 等）
│   │   │                         # └ FuelRecordUpdate → 修改记录（所有字段可选）
│   │   ├── auth.py               # 认证 Schema（P4 新增）
│   │   │                         # ├ UserRegister → 注册请求（username + password）
│   │   │                         # ├ UserLogin → 登录请求
│   │   │                         # ├ TokenResponse → JWT 响应
│   │   │                         # └ UserResponse → 用户信息响应
│   │   ├── vehicle.py            # 车辆 Schema（P5 新增）
│   │   │                         # ├ VehicleCreate → 创建车辆（name + plate + initial_mileage）
│   │   │                         # ├ VehicleUpdate → 修改车辆（name/plate/is_active 可选）
│   │   │                         # └ VehicleResponse → 响应格式
│   │   ├── stats.py              # 统计 Schema（P6 新增）
│   │   │                         # ├ SummaryResponse → 汇总统计响应
│   │   │                         # └ MonthlyResponse → 月度统计响应
│   │   ├── expense.py            # 支出 Schema（P10 新增）
│   │   │                         # ├ ExpenseCreate → 创建支出（amount + category_l1/l2/l3 + expense_date）
│   │   │                         # ├ ExpenseUpdate → 修改支出（所有字段可选）
│   │   │                         # ├ ExpenseResponse → 响应格式
│   │   │                         # ├ CategoryCreate → 创建分类（name + parent_id）
│   │   │                         # ├ CategoryUpdate → 修改分类（name + sort_order，禁止改 parent_id）
│   │   │                         # └ CategoryResponse → 分类响应（含 children 树形）
│       │   └── expense_stats.py      # 支出统计 Schema（P10 新增）
│       │                             # ├ BreakdownItem → 分类汇总行（category_l1/l2/l3 + total + percentage）
│       │                             # ├ PeriodItem → 分时段汇总（period + total + count + breakdown）
│       │                             # ├ ExpenseStatsResponse → 统计响应（支持 group_by=none/month）
│       │                             # └ MultiSummaryResponse → 六区间累计金额（P10.6 新增：current_year/month/week + recent_year/month/week）
│   │
│   ├── routers/                  # API 路由层：定义 HTTP 端点
│   │   ├── __init__.py           # Python 包标记
│   │   ├── records.py            # 加油记录路由
│   │   │                         # ├ POST   /api/v1/records → 创建记录（需 JWT, 含 vehicle_id）
│   │   │                         # ├ GET    /api/v1/records → 获取列表（按 user_id + vehicle_id 过滤）
│   │   │                         # ├ PUT    /api/v1/records/{id} → 修改记录（校验归属）
│   │   │                         # ├ DELETE /api/v1/records/{id} → 删除记录（校验归属）
│   │   │                         # └ GET    /api/v1/records/export/csv → 导出 CSV（P8 新增）
│   │   ├── auth.py               # 认证路由（P4 新增）
│   │   │                         # ├ POST /api/v1/auth/register → 注册（返回 JWT）
│   │   │                         # └ POST /api/v1/auth/login → 登录（返回 JWT）
│   │   ├── vehicles.py           # 车辆管理路由（P5 新增）
│   │   │                         # ├ POST   /api/v1/vehicles        → 创建车辆
│   │   │                         # ├ GET    /api/v1/vehicles        → 获取当前用户的车辆列表
│   │   │                         # ├ PUT    /api/v1/vehicles/{id}   → 修改车辆信息
│   │   │                         # └ DELETE /api/v1/vehicles/{id}   → 删除车辆（校验无关联记录）
│   │   └── stats.py              # 统计路由（P6 新增）
│   │                             # ├ GET /api/v1/stats/summary → 汇总统计（含 vehicle_id + start_date/end_date 日期筛选）
│   │                             # ├ GET /api/v1/stats/monthly → 月度统计（含 vehicle_id + start_date/end_date 日期筛选）
│   │                             # └ GET /api/v1/stats/timeline → 时间线统计（P10 新增：group_by=day/week/month 智能粒度）
│   │   └── health.py               # 健康检查路由（P11 新增）
│   │                             # ├ GET /api/v1/health → 基础健康检查
│   │                             # └ GET /api/v1/health/db → 数据库连接验证（按 X-Database-Env 头选择引擎）
│   │   ├── expenses.py           # 支出记录路由（P10 新增）
│   │   │                         # ├ POST   /api/v1/expenses          → 创建支出记录（201）
│   │   │                         # ├ GET    /api/v1/expenses          → 分页查询（按分类/日期筛选）
│   │   │                         # ├ PUT    /api/v1/expenses/{id}     → 修改记录（校验归属+分类链）
│   │   │                         # └ DELETE /api/v1/expenses/{id}     → 删除记录（204）
│       │   └── expense_categories.py # 分类 & 统计路由（P10 新增）
│       │                             # ├ POST   /api/v1/expenses/categories      → 创建分类（level 自动计算）
│       │                             # ├ GET    /api/v1/expenses/categories      → 获取分类树（树形返回）
│       │                             # ├ PUT    /api/v1/expenses/categories/{id} → 修改分类（仅 name/sort_order）
│       │                             # ├ DELETE /api/v1/expenses/categories/{id} → 删除分类（校验子分类+记录）
│       │                             # ├ GET    /api/v1/expenses/stats           → 多维度统计（group_by + 分类过滤）
│       │                             # └ GET    /api/v1/expenses/multi_summary   → 六区间累计金额（P10.6 新增：当年/当月/当周/近一年/近一月/近一周）
│   │
│   ├── services/                 # 业务逻辑层：核心算法
│   │   ├── __init__.py           # Python 包标记
│   │   ├── record_service.py     # 油耗计算服务
│   │   │                         # ├ create_record()            → 创建 + 油耗计算 + 里程校验 + 车辆归属校验（P5）
│   │   │                         # ├ get_records()              → 分页查询（按 user_id + vehicle_id + 日期/加满/备注 过滤，P6新增筛选）
│   │   │                         # ├ recalculate_consumption()  → 级联重算油耗（按 vehicle_id 隔离，P5）
│   │   │                         # ├ update_record()            → 修改记录（校验归属）
│   │   │                         # └ delete_record()            → 删除记录 + 基线保护（校验归属）
│   │   ├── auth_service.py        # 认证服务（P4 新增）
│   │   │                         # ├ register_user() → 注册（用户名唯一性 + 密码哈希 + 签发 JWT）
│   │   │                         # └ login_user()    → 登录（密码验证 + 签发 JWT）
│   │   └── vehicle_service.py    # 车辆管理服务（P5 新增）
│   │                             # ├ create_vehicle()   → 创建车辆
│   │                             # ├ get_vehicles()     → 获取当前用户的车辆列表
│   │                             # ├ update_vehicle()   → 修改车辆（校验归属）
│   │                             # └ delete_vehicle()   → 删除车辆（校验归属 + 无关联记录）
│   │   ├── stats_service.py      # 统计服务（P6 新增，P10 重构）
│       │   │                         # ├ get_summary() → 汇总统计（支持日期范围筛选，end_date +1天确保当天数据不截断）
│       │   │                         # ├ get_monthly() → 月度统计（按月分组，支持日期范围）
│       │   │                         # ├ get_timeline() → 时间线统计（P10 新增：按天/周/月聚合，week=每7天一段）
│       │   │                         # ├ get_multi_summary() → 六区间累计统计（P10.6 新增：当年/当月/当周/近一年/近一月/近一周）
│       │   │                         # └ _parse_date() → 日期解析辅助函数
│   │   ├── expense_service.py    # 支出记录服务（P10 新增）
│   │   │                         # ├ _validate_category_chain() → 校验 L1→L2→L3 分类链（父子关系+用户归属）
│   │   │                         # ├ create_expense() → 创建支出（含分类链校验）
│   │   │                         # ├ get_expenses() → 分页查询（按分类/日期/归属过滤）
│   │   │                         # ├ get_expense_by_id() → 获取单条记录
│   │   │                         # ├ update_expense() → 修改（分类链重校验+归属校验）
│   │   │                         # └ delete_expense() → 删除（归属校验）
│       │   └── expense_stats_service.py # 支出统计服务（P10 新增）
│       │                             # ├ get_stats() → 多维度聚合（支持 group_by=none/month/week/year）
│       │                             # ├ get_multi_summary() → 六区间累计金额（P10.6 新增：当年/当月/当周/近一年/近一月/近一周）
│       │                             # └ 跨数据库兼容：PostgreSQL 用 GROUP BY ROLLUP，SQLite 用多次 GROUP BY + UNION
│   │
│   └── core/                     # 基础设施层
│       ├── __init__.py           # Python 包标记
│       ├── security.py           # 安全工具（P4 新增）
│       │                         # ├ hash_password()    → bcrypt 密码哈希
│       │                         # ├ verify_password()  → bcrypt 验证明文密码
│       │                         # ├ generate_access_token() → JWT 签发
│       │                         # └ verify_access_token()   → JWT 验证 + 过期检测
│       └── deps.py               # FastAPI 依赖注入（P4 新增）
│                                 # └ get_current_user() → 从 Authorization 头提取 JWT → 返回 User ORM
│                                 #    └ P8.4 修复：HTTPBearer(auto_error=False) + 手动 401（修复无 Token 时 403）
│   │
│   ├── alembic.ini                # Alembic 数据库迁移配置（P7 新增）
│   │                              # └ sqlalchemy.url 在 env.py 中动态指定，自动适配 SQLite/PostgreSQL/MySQL
│   │
│   ├── alembic/                   # Alembic 迁移脚本目录（P7 新增）
│   │   ├── env.py                 # 迁移环境：导入项目 config + Base.metadata，支持 autogenerate
│   │   ├── script.py.mako         # 迁移脚本模板
│   │   └── versions/
│   │       ├── ff245e876ff9_initial_schema.py      # 初始迁移：users + vehicles + fuel_records
│   │       ├── 24b921f41e3b_add_performance_indexes.py  # P8 新增：性能索引（复合索引 + 单列索引）
│   │       └── 7b168dd2c3d1_add_expense_tables.py       # P10 新增：expenses + expense_categories 表 + 4 个索引
│   │
│   ├── tests/                     # pytest 单元测试（P7 新增）
│   │   ├── __init__.py            # 包标记
│   │   ├── conftest.py            # 测试基础设施：SQLite :memory: + StaticPool + 独立测试 App
│   │   ├── test_services.py       # 服务层测试（26 个）：安全/认证/车辆/油耗计算/级联重算/筛选/统计
│   │   ├── test_api.py            # API 层测试（14 个）：鉴权/CRUD/数据隔离
│   │   └── test_expense_api.py    # 支出模块测试（P10 新增）：17 个测试覆盖分类 CRUD + 支出 CRUD + 统计 + 数据隔离
│   │
│   ├── requirements.txt           # Python 依赖列表
│   │                              # └ P7 新增：alembic, pytest, httpx
│
├── frontend/                     # 前端代码（React + Vite + Capacitor）
│   │
│   ├── .env.production           # 生产环境变量：VITE_API_BASE_URL = Render 线上地址
│   │
│   ├── index.html                # Vite 入口 HTML
│   │
│   ├── package.json              # 前端依赖：React 19 + axios + Capacitor
│   │                             # └ P9 新增：build:apk 构建后自动输出 dist/fuel_records_v$npm_package_version.apk
│   │
│   ├── vite.config.ts            # Vite 配置：React 插件 + /api 代理 + VITE_APP_VERSION 注入（P9）
│   │                             # └ define: { VITE_APP_VERSION } ← package.json version
│   │
│   ├── capacitor.config.ts       # Capacitor 配置：appId = com.fuelrecords.app
│   │
│   ├── dist/                     # 生产构建输出：Vite build + 版本化 APK 副本（v$version.apk）
│   │
│   ├── android/                  # Capacitor 生成的 Android 原生项目
│   │   ├── app/build/outputs/apk/debug/app-debug.apk  # 最终 APK
│   │   ├── build.gradle          # 顶层 Gradle：Kotlin stdlib 冲突排除
│   │   └── gradle/wrapper/gradle-wrapper.properties  # Gradle 腾讯云镜像加速
│   │
│   └── src/                      # React 源码
│       ├── main.tsx              # React 入口：BrowserRouter + Routes 路由配置（P4 新增路由守卫，P6 新增 /stats 路由）
│       │                         # └ P10 新增：Layout 包裹 TopBar/BottomNav/Outlet，/ → 重定向 /fuel，新增 /expense
│       │                         # └ P10.5 新增：FuelDataLayout → FuelDataProvider 包裹 /fuel 和 /fuel/stats（跨路由数据保持）
│       │                         # └ P10.5 新增：ExpenseDataLayout → ExpenseDataProvider 包裹 /expense 和 /expense/stats（跨路由数据保持）
│       │                         # └ P10.6 变更：DataProviders 合并，同时挂载两个 Context，Tab 切换不重新 fetch
│       │                         # └ 新增 /docs 路由：文档页在 Layout 内但不使用 DataProviders（不需要油耗/记账 Context）
│       ├── App.tsx               # 加油主页面：加油表单 + 记录列表 + 车辆选择器（P5）+ 筛选面板（P6）
│       │                         # └ P5 新增：车辆下拉选择器 + 添加车辆表单 + localStorage 记忆
│       │                         # └ P6 新增：筛选面板（日期范围/加满/备注搜索），位于表单与记录列表之间
│       │                         # └ P8 新增：导出按钮（CSV）+ 主题切换 + 分页加载更多
│       │                         # └ P9 新增：useEffect checkUpdate() 启动检测 + 升级弹窗 UI
│       │                         # └ P10 变更：主题切换+退出登录移到 TopBar；移除加油提醒功能；移除 BottomPanel/FAB
│       │                         # └ P10 重构：筛选入口改为带图标的卡片按钮，筛选按钮右对齐，面板滑入动画
│       │                         # └ P10.5 重构：状态迁移到 FuelDataContext，useFuelData() 替代本地 useState
│       │                         # └ P10.6 新增：累计统计下拉框（当年/当月/自上月累计油耗+金额），与筛选按钮同行，localStorage 记忆选择
│       │                         # └ P10.6 新增：PullToRefresh 下拉刷新 + FuelPageSkeleton 骨架屏
│       ├── App.css               # 主页面样式：CSS 变量主题系统（P8 暗色模式）+ 卡片布局 + 按钮
│       │                         # └ P8.4 新增：8 个 @keyframes（fadeInUp/scaleIn/bgShift/shimmer/glowPulse/float）
│       │                         #          玻璃态卡片（backdrop-filter）+ 对角渐变背景游走
│       │                         #          装饰光斑（::before/::after 巨型径向渐变球浮动）
│       │                         #          shimmer 按钮扫光 + 大圆角系统（12-18px）
│       │                         # └ P9 新增：.upgrade-overlay / .upgrade-modal / .upgrade-progress（升级弹窗+进度条）
│       │                         #          .app-version（登录页版本号脚注）
│       ├── pages/
│       │   ├── LoginPage.tsx     # 登录/注册页面（P4 新增）
│       │   │                     # └ 两个 Tab 切换登录/注册，成功后存 token 并跳转首页
│       │   │                     # └ P9 新增：底部显示 app-version（v0.0.1）
│       │   │                     # └ P11 新增：标题栏右侧 ⚙ 设置齿轮按钮
│       │   ├── StatsPage.tsx     # 油耗统计页面（全屏，P6 新增，P10 重构）
│       │   │                     # ├ 概览卡片（总里程/平均油耗/总花费/总加油量），筛选后仅更新数字不重新渲染
│       │   │                     # ├ 日期选择器（开始日期 ↔ 结束日期）+ 快捷按钮（近一年/近一月/近一周）
│       │   │                     # ├ 油耗趋势图（Recharts 双Y轴，粒度智能切换：≤14天→按天 ≤90天→按周 >90天→按月）
│       │   │                     # ├ Y 轴标签水平排列在图表上方（左油耗 / 右花费），增大图表可用宽度
│       │   │                     # ├ 无数据日期填充 0 保持连续曲线，空数据点不画圆点
│       │   │                     # ├ 月度明细表（始终按月统计，由日期范围筛选）
│       │   │                     # ├ P10.5：状态迁移到 FuelDataContext，useFuelData() 替代本地 loadVehicles() + VEHICLE_KEY
│       │   │                     # └ 已删除：年份选择器、截图分享按钮
│       │   ├── StatsPage.css      # 油耗统计页面样式：CSS 变量主题 + 玻璃态卡片 + 4 色渐变装饰线
│       │   │                     # └ 新增：日期行/快捷按钮(chart-period-btn)、图表卡片(chart-card)
│       │   ├── LoginPage.css      # 登录页面样式（P4 新增，P8.4 动画增强）
│       │   ├── ExpensePage.tsx   # 记账主页面（P10 新增）：金额 → CategoryPicker 合并选择器 → 日期 → 备注 → 提交 → 列表
│       │   │                     # └ 状态：amount/l1/l2/l3/date/note/editingId
│       │   │                     # └ 编辑回填、左滑删除（500ms 长按 + 震动反馈，防误触）、分页加载更多
│       │   │                     # └ 编辑态选中项 accent 边框高亮、同日期记录虚线分组
│       │   │                     # └ 提交/删除时自动更新 CategoryPicker 频次计数（+1/–1）
│       │   │                     # └ P10.5 重构：状态迁移到 useExpenseData()，三级 select → CategoryPicker
│       │   │                     # └ P10.6 新增：ExpenseSummaryCards 六卡片（当年/当月/当周/近一年/近一月/近一周累计金额）
│       │   │                     # └ P10.6 新增：PullToRefresh 下拉刷新 + ExpensePageSkeleton 骨架屏
│       │   ├── ExpenseStatsPage.tsx  # 记账统计全屏页（P10 重构）：汇总卡片 + 饼图下钻/堆叠柱状图（图例下钻 L1→L2→L3）+ 折叠式分类管理
│       │   │                         # └ 分类管理：树形展示 + `├──`/`└──` 线段可视化（tree 命令风格）+ CategoryModal 统一弹框（重命名/添加）
│       │   │                         # └ 分类添加按钮始终可见，CSS 虚线延伸至按钮，一级靠左/二级居中/三级靠右对齐
│       │   │                         # └ 日期选择：自由日期范围 + 近一年/近一月/近一周快捷按钮
│       │   │                         # └ 汇总卡片：总支出/笔数/日均，带彩色顶部装饰线（与油耗统计对齐）
│       │   │                         # └ 饼图下钻："其他"归并（<5% 聚合）+ 递归下钻 + 引导线标签 + 下方 2 列图例（名称/占比/金额）
│       │   │                         # └ 柱状图下钻：默认 L1 分色堆叠 → 点击图例 → L2 → L3 逐级下钻 + ← 返回按钮
│       │   │                         # └ P11 变更：旭日图已移除（仅保留饼图和柱状图 ChartType 'pie'|'bar'）
│       │   │                         # └ 图表全屏：右上角 ⛶ 按钮。柱状图全屏用 layout="vertical"（水平条形图）适配横屏
│       │   │                         # └ 修改日期不清空页面，仅刷新数据（firstLoad ref 控制）
│       │   ├── ExpenseStatsPage.css  # 记账统计页样式
│       │   ├── DocsPage.tsx        # 文档页（新增）：全屏 iframe 嵌入 https://doc.zhangpan.online/，sandbox 权限控制
│       │   │                       # └ 该页面不使用 DataProviders，Layout 中自动隐藏 BottomNav 和 SmartFAB
│       │   ├── DocsPage.css        # 文档页样式：fixed 定位填满 TopBar 与底栏之间的区域
│       │   └── ExpensePage.css   # 记账页面样式（P10 新增）：大号金额 ¥ 输入，CategoryPicker / 日期 / 备注毛玻璃对齐
│       │                         # └ 记录列表三行堆叠布局（分类 / 金额+编辑 / 日期+备注），gap:0 紧凑，min-height:80px
│       │                         # └ P11 变更：expense-day-group 移除边框/背景/圆角/阴影，仅 28px 留白 + 日期标签自然区分
│       │
│       ├── components/           # 通用组件
│       │   ├── TopBar.tsx        # 全局顶栏（40px）：左侧 App 名称/子页←返回按钮，右侧主题切换 + 📖 文档 + ⚙ 设置齿轮
│       │   │                     # └ 非 Tab 页面（/fuel、/expense 之外）自动显示"← 返回"按钮
│       │   │                     # └ 主题：light/dark/auto 三态循环，通过 localStorage + data-theme 共享
│       │   │                     # └ 文档按钮：📖 图标 → 跳转 /docs 页面
│       │   ├── TopBar.css         # 顶栏样式：固定顶部、左右布局、主题按钮、.back-btn 返回按钮
│       │   ├── SettingsModal.tsx   # 设置弹窗（P11 新增）：账户信息（用户名+DB标识）+ 版本检查 + 数据库切换（正式/测试 radio）
│       │   ├── SettingsModal.css   # 设置弹窗样式
│       │   ├── CategoryModal.tsx   # 分类操作统一弹框（P11 新增）：支持 rename / addChild / addSibling 三种模式
│       │   ├── CategoryModal.css   # 分类弹框样式
│       │   ├── BottomNav.tsx      # 底部导航：双 Tab（⛽ 油耗 / 💰 记账），固定底部，全局可见（含子页面）
│       │   ├── BottomNav.css      # 底部导航样式：icon + label、active 高亮
│       │   ├── Layout.tsx         # 全局布局：TopBar + Outlet + BottomNav + SmartFAB（/login 除外）
│       │   │                       # └ /docs 页自动隐藏 BottomNav 和 SmartFAB，仅保留 TopBar 返回按钮
│       │   ├── SmartFAB.tsx       # 智能浮动按钮（P10 重构）：路由感知，主页→统计/统计→返回，可全屏拖拽，位置持久化
│       │   │                     # └ routeActions 映射表可扩展，后续可改为弹出菜单
│       │   │                     # └ P11 优化：z-index:10001 覆盖全屏遮罩，全屏模式下仅关闭全屏不跳转路由
│       │   ├── SmartFAB.css       # FAB 样式：胶囊形 + 对角渐变 + 玻璃态 + 呼吸光晕 + 拖拽反馈
│       │   ├── CategoryPicker.tsx  # 记账分类合并选择器（P10.5 新增）：搜索 + Top5 常用 + 级联树 + 上次记忆
│       │   │                       # └ 面板打开时 div 避免移动端键盘，二次点击变 input 可搜索
│       │   │                       # └ 提交 +1 / 删除 –1 频次计数，localStorage 最近 7 天懒清理
│       │   │                       # └ 创建子分类时弹窗标题带完整父级路径
│       │   └── CategoryPicker.css  # 分类选择器样式：触发器对齐车辆选择器 + 玻璃态 + 箭头动画 + 背景锁定
│       │   ├── ExpenseSummaryCards.tsx  # 记账统计卡片组件（P10.6 新增）：两行三列 grid，显示当年/当月/当周/近一年/近一月/近一周累计金额
│       │   ├── ExpenseSummaryCards.css  # 卡片毛玻璃样式
│       │   ├── ExpensePageSkeleton.tsx  # 记账页骨架屏（P10.6 新增）：金额→分类→日期→6卡片→4记录，布局与真实页面一致
│       │   ├── ExpensePageSkeleton.css  # 骨架屏 shift 动画 + 渐变底色
│       │   ├── FuelPageSkeleton.tsx     # 油耗页骨架屏（P10.6 新增）：车辆栏→表单→统计行→4记录，布局与真实页面一致
│       │   ├── FuelPageSkeleton.css     # 骨架屏 shift 动画 + 渐变底色
│       │   ├── PullToRefresh.tsx        # 下拉刷新通用组件（P10.6 新增）：触摸手势 + 方向阈值（避免与左滑删除冲突）+ 旋转 spinner
│       │   │                              # └ 优化：window.scrollY 检测真实滚动位置，仅页面在顶部时触发
│       │   └── PullToRefresh.css        # 下拉刷新样式：indicator + spin 动画
│       │
│       ├── context/               # React Context 状态管理（P10.5 新增）
│       │   ├── FuelDataContext.tsx  # 加油数据共享 Context：vehicles / selectedVehicleId / records / filters 等
│       │   │                        # └ FuelDataProvider 包裹 /fuel 和 /fuel/stats 路由，切换页面状态不丢失
│       │   │                        # └ useFuelData() hook：子组件消费共享状态
│       │   └── ExpenseDataContext.tsx # 记账数据共享 Context（P10.5 新增）：categories / expenses / total / page / loading
│       │                              # └ ExpenseDataProvider 包裹 /expense 和 /expense/stats 路由，切换页面不重复请求
│       │                              # └ P10.6 新增：multiSummary / multiSummaryLoading 状态 + refreshMultiSummary() 方法
│       │
│       └── services/
│           ├── api.ts            # API 服务层
│           │                     # ├ FuelRecord / Vehicle 类型定义
│           │                     # ├ Stats 类型：SummaryStats / MonthlyStats / MonthlyItem / TimelineStats / TimelineItem（P6/P10）
│           │                     # ├ Auth API: register(), login()
│           │                     # ├ Token 管理: getToken(), setToken(), clearToken()
│           │                     # ├ DB 环境管理（P11 新增）: getDatabaseEnv(), setDatabaseEnv()
│           │                     # ├ 请求拦截器：自动附加 Authorization: Bearer <token> + X-Database-Env: prod|test（P11）
│           │                     # ├ 响应拦截器：401 自动清除 token 并跳转登录页
│           │                     # ├ Records CRUD: create/fetch（支持筛选参数）/update/delete
│           │                     # ├ Stats API: fetchSummary() / fetchMonthly() / fetchTimeline()（均支持 start_date/end_date）
│           │                     # ├ Export API: exportCSV()（P8 新增）
│           │                     # ├ Expense API: fetch/create/update/delete + fetchCategories + Category CRUD + fetchExpenseStats（P10 新增）
│           │                     # ├ Expense API: fetchMultiSummary()（P10.6 新增：六区间累计金额）
│           │                     # └ parseRecord() → Decimal 字符串转数字
│           ├── upgrade.ts        # 版本更新检测服务（P9 新增）⚠️ 最高优先级，修改前必须征得用户同意
│           │                     # ├ getLatestVersion()    → fetch Supabase app_versions 表
│           │                     # ├ checkUpdate()         → 对比 CURRENT_VERSION_CODE（从 package.json version 自动计算）
│           │                     # ├ downloadApk(url, onProgress) → XHR 下载 + 进度回调
│           │                     # └ installApk(localPath) → Filesystem 写入 + Intent 调安装器
│           ├── upgrade.md        # 版本更新功能规格书（/to-spec 产物）⚠️ 包含保护约束
│           └── upgrade.tickets.md # 版本更新任务拆解清单（/to-tickets 产物）
│
├── scripts/                     # 运维脚本（P9 新增）
│   └── upload-apk.js            # 发版脚本：升版本号 → 计算 version_code → 构建 → 上传 → INSERT
│                                # └ 用法：export $(grep -v '^#' .env | xargs) && node scripts/upload-apk.js
│                                # └ 依赖环境变量：SUPABASE_SERVICE_KEY（service_role）
│
```

---

## 打包与发版流程（P9 新增）

### 一键发版

```bash
cd /Users/zp/Code/fuel_records
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export $(grep -v '^#' .env | xargs)
node scripts/upload-apk.js
```

脚本自动完成：npm version patch → 计算 version_code（MAJOR×10000+MINOR×100+PATCH） → build APK → 上传 Storage → INSERT 表

### Supabase 基础设施

| 组件 | 位置 | 说明 |
|------|------|------|
| `app_versions` 表 | Supabase → Table Editor | 存储版本信息（version_code, version_name, apk_url） |
| RLS 策略 | `anon can read app_versions` | 允许 App 匿名查询最新版本 |
| Storage bucket `apk` | Supabase → Storage | public bucket，存放 APK 文件 |
| Data API | Settings → API | **必须开启**（默认关），否则 REST API 503 |

### 版本检测原理

```
App 启动
  → upgrade.ts: checkUpdate()
    → fetch Supabase app_versions 表（匿名读）
      → 获取最新 version_code
        → 对比 CURRENT_VERSION_CODE（build 时从 package.json version 自动计算）
          ├ code > CURRENT → 弹"发现新版本"弹窗
          └ code <= CURRENT → 静默跳过
```

### 升级文件清单

| 文件 | 作用 |
|------|------|
| `frontend/src/services/upgrade.ts` | 核心：检测/下载/安装 |
| `frontend/src/App.tsx` | UI：弹窗 + 进度条 |
| `frontend/vite.config.ts` | 注入 `VITE_APP_VERSION` |
| `frontend/src/pages/LoginPage.tsx` | 底部显示 `v0.0.x` |
| `scripts/upload-apk.js` | 发版：上传 Supabase + INSERT 表 |
| Supabase `app_versions` | 版本记录表 |
| Supabase Storage `apk` | APK 文件托管 |
