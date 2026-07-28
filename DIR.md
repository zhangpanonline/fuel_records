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
│                                 # Render URL: https://fuel-records-api.onrender.com
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
│   │   └── fuel_record.py        # FuelRecord 模型：加油记录表
│   │                             # └ 字段：id, mileage, fuel_volume, fuel_cost,
│   │                             #          unit_price, is_full_tank, is_baseline,
│   │                             #          fuel_consumption, note, record_date, created_at
│   │
│   ├── schemas/                  # Pydantic Schema 层：API 请求/响应数据格式
│   │   ├── __init__.py           # Python 包标记
│   │   └── record.py             # 加油记录 Schema
│   │                             # ├ FuelRecordCreate → 创建记录（校验 mileage>0 等）
│   │                             # ├ FuelRecordResponse → 响应格式（含 id, unit_price 等）
│   │                             # └ FuelRecordUpdate → 修改记录（所有字段可选）
│   │
│   ├── routers/                  # API 路由层：定义 HTTP 端点
│   │   ├── __init__.py           # Python 包标记
│   │   └── records.py            # 加油记录路由
│   │                             # ├ POST /api/v1/records → 创建记录
│   │                             # └ GET  /api/v1/records → 获取列表（分页）
│   │
│   ├── services/                 # 业务逻辑层：核心算法
│   │   ├── __init__.py           # Python 包标记
│   │   └── record_service.py     # 油耗计算服务
│   │                             # ├ create_record() → 创建 + 油耗计算 + 里程校验
│   │                             # └ get_records()  → 分页查询（按时间倒序）
│   │
│   └── core/                     # 基础设施层（预留）
│       └── __init__.py           # Python 包标记
│                                 # （后续：security.py、deps.py、exceptions.py）
│
└── frontend/                     # 前端代码（预留，Phase 1.6 开始创建）
    └── (React + Capacitor)
```
