# Fuel Records — 测试前置要求

> 本文档为所有测试规格书的共用前置条件，涵盖环境配置、数据库约定、测试账号和运行命令。

---

## 数据库

| 项目 | 说明 |
|------|------|
| 数据库类型 | PostgreSQL 测试库 |
| 环境变量 | `DB_PG_URL_TEST`（后端 `.env` 中配置） |
| `DB_TYPE` | `postgresql_test` |

> [!CAUTION]
> **线上测试必须使用测试数据库（`DB_PG_URL_TEST`），禁止碰生产数据库。**
> 生产数据库（`DB_PG_URL`）仅用于 Render/Fly.io 部署环境，任何情况下都不许直连测试。

---

## 后端测试基础设施 (`conftest.py`)

| 项目 | 说明 |
|------|------|
| 清理策略 | 事务级回滚：每个测试运行在独立事务中，测试结束后自动回滚，数据不残留 |
| 隔离模式 | connection 级事务 + rollback，每个测试独立 Session |
| 表创建 | 模块级 `Base.metadata.create_all()` 一次性建表 |
| TestClient | 独立 FastAPI app，手动注册所有 router，通过 `dependency_overrides` 注入测试 DB Session |

### 核心 fixture

| fixture | scope | 说明 |
|---------|-------|------|
| `db_session` | function | 独立 DB Session，事务回滚清理 |
| `client` | function | TestClient，模拟 HTTP 请求 |

### 辅助函数

| 函数 | 说明 |
|------|------|
| `register_user(client, username, password)` → `dict` | 注册并返回完整响应（含 `access_token`） |
| `auth_headers(token)` → `dict` | 生成 `{"Authorization": "Bearer {token}"}` |
| `_create_user(db_session, user_id=None)` | 直接插入 User ORM（单元测试用） |

---

## 运行命令

```bash
# 单元测试
cd backend && source .venv/bin/activate && PYTHONPATH=. pytest tests/test_services.py -v

# 集成测试
cd backend && source .venv/bin/activate && PYTHONPATH=. pytest tests/test_api.py tests/test_expense_api.py -v

# 端到端测试（API 自动化部分）
cd backend && source .venv/bin/activate && PYTHONPATH=. pytest tests/test_e2e.py -v

# 全量测试
cd backend && source .venv/bin/activate && PYTHONPATH=. pytest tests/ -v
```

---

## E2E 测试环境

### 本地环境
- 后端: `http://localhost:8000`
- 数据库: 测试数据库 `DB_PG_URL_TEST`（`DB_TYPE=postgresql_test`）

### 本地启动 E2E 测试 Server

```bash
cd backend && source .venv/bin/activate && uvicorn main:app --host 0.0.0.0 --port 8000 &
cd ..
BASE="http://localhost:8000/api/v1"
```

### 线上测试环境
- 后端: `https://fuel-records.onrender.com` 或 `https://fuel-records.fly.dev`
- App 内 `设置弹窗 → 数据库` 切换到测试库
- App 内 `设置弹窗 → 服务器` 可切换 Render / Fly.io

---

## E2E 测试账号约定

> [!IMPORTANT]
> 业务功能测试使用固定账号 `zp` / `zp1992`，除非测试场景本身涉及账号创建/鉴权/隔离。
>
> | 测试场景 | 使用账号 |
> |---------|---------|
> | 加油记录 CRUD、油耗统计、多车管理 | `zp` / `zp1992` |
> | 记账支出 CRUD、分类管理、统计图表 | `zp` / `zp1992` |
> | 下拉刷新、骨架屏、SmartFAB、设置 | `zp` / `zp1992` |
> | 注册/登录/Token 过期 | 新建临时账号 |
> | 数据隔离验证（A 不能看 B 的数据） | 新建临时账号 B |
>
> 如果 `zp` 在测试库中不存在，先注册：`POST /api/v1/auth/register` → `{"username":"zp","password":"zp1992"}`
