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
├── README.tickets.md             # 任务拆解清单：8 个 Phase 的原子 Ticket，教学进度
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
│   │                             # 路由：GET /api/v1/health
│   │
│   ├── config.py                 # 配置管理：读取 .env，提供 Settings 单例
│   │                             # 关键类：Settings(BaseSettings)
│   │                             # 支持 DB_TYPE：sqlite（本地开发）/ postgresql（Render+Supabase部署）/ mysql（Docker 自建）
│   │                             #        DB_PG_URL → Supabase/PostgreSQL 连接串（部署用）
│   │
│   ├── database.py               # 数据库连接管理
│   │                             # 关键对象：engine（连接池）、SessionLocal（会话工厂）
│   │                             #          Base（ORM 基类）
│   │                             # 关键函数：init_db()（建表）、get_db()（依赖注入）
│   │                             # connect_args: check_same_thread 仅对 SQLite 生效，PostgreSQL 不走此参数
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
│   │   │                         # └ 关系：records → FuelRecord（一对多）
│   │   └── fuel_record.py        # FuelRecord 模型：加油记录表
│   │                             # └ 字段：id, user_id(FK), mileage, fuel_volume, fuel_cost,
│   │                             #          unit_price, is_full_tank, is_baseline,
│   │                             #          fuel_consumption, note, record_date, created_at
│   │                             # └ 关系：user → User（多对一，P4 新增）
│   │
│   ├── schemas/                  # Pydantic Schema 层：API 请求/响应数据格式
│   │   ├── __init__.py           # Python 包标记
│   │   ├── record.py             # 加油记录 Schema
│   │   │                         # ├ FuelRecordCreate → 创建记录（校验 mileage>0 等）
│   │   │                         # ├ FuelRecordResponse → 响应格式（含 id, user_id, unit_price 等）
│   │   │                         # └ FuelRecordUpdate → 修改记录（所有字段可选）
│   │   └── auth.py               # 认证 Schema（P4 新增）
│   │                             # ├ UserRegister → 注册请求（username + password）
│   │                             # ├ UserLogin → 登录请求
│   │                             # ├ TokenResponse → JWT 响应
│   │                             # └ UserResponse → 用户信息响应
│   │
│   ├── routers/                  # API 路由层：定义 HTTP 端点
│   │   ├── __init__.py           # Python 包标记
│   │   ├── records.py            # 加油记录路由
│   │   │                         # ├ POST   /api/v1/records → 创建记录（需 JWT）
│   │   │                         # ├ GET    /api/v1/records → 获取列表（按 user_id 过滤）
│   │   │                         # ├ PUT    /api/v1/records/{id} → 修改记录（校验归属）
│   │   │                         # └ DELETE /api/v1/records/{id} → 删除记录（校验归属）
│   │   └── auth.py               # 认证路由（P4 新增）
│   │                             # ├ POST /api/v1/auth/register → 注册（返回 JWT）
│   │                             # └ POST /api/v1/auth/login → 登录（返回 JWT）
│   │
│   ├── services/                 # 业务逻辑层：核心算法
│   │   ├── __init__.py           # Python 包标记
│   │   ├── record_service.py     # 油耗计算服务
│   │   │                         # ├ create_record()            → 创建 + 油耗计算 + 里程校验（P4: 加 user_id）
│   │   │                         # ├ get_records()              → 分页查询（P4: 按 user_id 过滤）
│   │   │                         # ├ recalculate_consumption()  → 级联重算油耗（P2 新增）
│   │   │                         # ├ update_record()            → 修改记录（P4: 校验归属）
│   │   │                         # └ delete_record()            → 删除记录 + 基线保护（P4: 校验归属）
│   │   └── auth_service.py        # 认证服务（P4 新增）
│   │                             # ├ register_user() → 注册（用户名唯一性 + 密码哈希 + 签发 JWT）
│   │                             # └ login_user()    → 登录（密码验证 + 签发 JWT）
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
│
├── apk-build-guide.md            # APK 打包完整指南：环境依赖、打包步骤、常见坑及修复
│
├── frontend/                     # 前端代码（React + Vite + Capacitor）
│   │
│   ├── .env.production           # 生产环境变量：VITE_API_BASE_URL = Render 线上地址
│   │
│   ├── index.html                # Vite 入口 HTML
│   │
│   ├── package.json              # 前端依赖：React 19 + axios + Capacitor
│   │
│   ├── vite.config.ts            # Vite 配置：React 插件 + /api 代理到 localhost:8000
│   │
│   ├── capacitor.config.ts       # Capacitor 配置：appId = com.fuelrecords.app
│   │
│   ├── dist/                     # 生产构建输出（npm run build）
│   │
│   ├── android/                  # Capacitor 生成的 Android 原生项目
│   │   ├── app/build/outputs/apk/debug/app-debug.apk  # 最终 APK
│   │   ├── build.gradle          # 顶层 Gradle：Kotlin stdlib 冲突排除
│   │   └── gradle/wrapper/gradle-wrapper.properties  # Gradle 腾讯云镜像加速
│   │
│   └── src/                      # React 源码
│       ├── main.tsx              # React 入口：BrowserRouter + Routes 路由配置（P4 新增路由守卫）
│       ├── App.tsx               # 主页面：加油表单 + 记录列表 + 退出登录按钮
│       │                         # └ P4 新增：退出登录（clearToken + 跳转）
│       ├── App.css               # 样式：卡片布局、按钮、基线标记 + 登录/注册表单（P4 新增）
│       ├── pages/
│       │   └── LoginPage.tsx     # 登录/注册页面（P4 新增）
│       │                         # └ 两个 Tab 切换登录/注册，成功后存 token 并跳转首页
│       └── services/
│           └── api.ts            # API 服务层
│                                 # ├ FuelRecord 类型定义
│                                 # ├ Auth API: register(), login()（P4 新增）
│                                 # ├ Token 管理: getToken(), setToken(), clearToken()（P4 新增）
│                                 # ├ 请求拦截器：自动附加 Authorization: Bearer <token>（P4 新增）
│                                 # ├ 响应拦截器：401 自动清除 token 并跳转登录页（P4 新增）
│                                 # ├ Records CRUD: create/fetch/update/delete
│                                 # └ parseRecord() → Decimal 字符串转数字
│
```
