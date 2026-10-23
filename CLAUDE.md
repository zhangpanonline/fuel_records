# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目定位

Fuel Records：摩托车油耗记录 + 个人记账 App（React + Capacitor 打包 APK，无应用商店分发），后端 FastAPI + Supabase PostgreSQL。所有工作按 `README.tickets.md` 的原子 Ticket 推进，规格书是唯一权威来源。全程使用中文交流。

## 工作方式（必须遵守）

- **规格书优先**：`README.md`（总规格）、`SPEC/*.md`（模块规格 + tickets）、`test-specs/*.md`（测试规格）是需求与设计的权威文档。改动功能前先读对应规格书，改完同步更新规格书。
- **任务推进**：完成一个 Ticket 后更新 `DIR.md` 并标记 `[x]`。
- **术语**：写代码注释/文档时使用 `SPEC/GLOSSARY.md`（全局）与 `CONTEXT.md`（SmartFAB）的规范术语，注意各条目的 `_Avoid_` 别名。
- **决策留痕**：架构决策记录在 `SPEC/ADRs/`（ADR-001~005）。做新设计决策时，若符合"难逆转 + 无上下文会困惑 + 存在真实取舍"，先盘问确认再落 ADR。

## 常用命令

```bash
# ── 后端（backend/ 目录，Python 3.12 venv）──
cd backend && source .venv/bin/activate
PYTHONPATH=. uvicorn main:app --host 0.0.0.0 --port 8000   # 本地启动（启动时自动跑 Alembic）
PYTHONPATH=. pytest tests/ -v                              # 全量测试（需 DB_PG_URL_TEST）
PYTHONPATH=. pytest tests/test_services.py -v              # 单元测试
PYTHONPATH=. pytest tests/test_api.py tests/test_expense_api.py -v  # 集成测试
PYTHONPATH=. pytest tests/test_e2e.py -v                   # E2E API 测试
PYTHONPATH=. pytest tests/test_services.py::TestRecordService::test_full_after_partial_uses_last_full -v  # 单个测试

# ── 前端（frontend/ 目录）──
npm run dev        # Vite 开发（/api 代理到 localhost:8000）
npm run build      # tsc -b && vite build
npm run lint       # oxlint
npm test           # vitest

# ── 打包 APK / 发版（repo 根目录，需 JDK 21）──
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
npm run build:apk            # frontend/ 下执行：构建 release 签名包到 dist/fuel_records_vX.X.X.apk
export $(grep -v '^#' .env | xargs) && node scripts/upload-apk.js   # 一键发版：升版本→构建→上传 Supabase→写 app_versions
```

## 架构要点

### 后端（backend/，五层结构）

- 分层：`routers/` → `services/` → `models/` + `schemas/` → `core/`（security + deps + exceptions）。路由只做参数接收与 `BusinessError → HTTPException` 转换，业务逻辑全在 services。
- **双数据库引擎**：`database.py` 维护 `prod_engine` + `test_engine`，`get_db()` 按请求头 `X-Database-Env: prod|test` 选 Session；`init_db()` 对两库同时 Alembic 迁移。**线上测试只能用测试库（`DB_PG_URL_TEST`），任何情况下不许直连生产库。**
- **双服务器**：Render 与 Fly.io 共用同一 JWT_SECRET 与同一 Supabase，token 互通。Fly.io 是线上主力（`api.ts` `DEFAULT_SERVER='flyio'`），Render 备用。
- 鉴权：全部业务路由 `Depends(get_current_user)`（`core/deps.py`，`HTTPBearer(auto_error=False)`，无 token 一律 401）。数据隔离靠 services 层按 `user_id` 过滤 + 归属校验。

### 油耗域（`services/record_service.py`）

- **参考里程 = 上一条"加满"记录的里程**，跳过未加满记录；无加满历史回退 `vehicle.initial_mileage`（ADR-001）。公式：`加油量 ÷ (当前里程 − 参考里程) × 100`。
- 里程校验仍与紧邻上一条记录（任意类型）比较，严格递增；首条不得低于 `initial_mileage`。
- `initial_mileage` 是永久隐式基线（ADR-002）：`is_baseline` 仅标记首条记录，删除唯一记录直接放行。
- 任何修改/删除记录后必须 `recalculate_consumption`（级联重算后续所有记录），重算时维护 `previous`（里程校验/is_baseline）与 `last_full`（油耗参考）两个指针。

### 记账域

- `expense_categories`：用户自定义三级分类树（自引用 `parent_id`，level 自动计算，最多 3 层，禁止改 parent_id）。
- `expenses` 冗余存 `category_l1/l2/l3` **名称快照**（ADR-003）：重命名不回写历史记录；分类删除前按名称计数校验无关联记录。
- 统计用 PostgreSQL `GROUP BY ROLLUP` 单查询完成全层级聚合；六区间统计（`multi_summary`）单查询 `SUM(CASE WHEN ...)` 一次算完。

### 前端（frontend/src/）

- 路由：`/login`、`/fuel` + `/fuel/stats`（油耗）、`/expense` + `/expense/stats`（记账）、`/docs`、`/predict/rules`。`DataProviders` 同时挂载 `FuelDataContext` + `ExpenseDataContext`，Tab 切换不重新 fetch。
- `services/api.ts`：axios 请求拦截器动态设置 baseURL（SERVERS 映射）+ `X-Database-Env` + Bearer token；401 自动清 token 跳登录。
- **SmartFAB 预测引擎**（`engine/`）：规则-权重-置信度系统，localStorage 存 `fab_rules` / `fab_behavior_log`。`PredictionContext` 双向通道（页面 `updatePageState` 上报 → 引擎 `pendingAction` 下发）。FAB 无预测时降级为静态 routeActions。
- 主题与性能模式走 `<html>` 属性 `data-theme` / `data-performance`，纯 CSS 处理，无需 JS 分支。

## ⚠️ 自动更新是生命线（最高优先级）

App 无应用商店分发，自动更新失效 = 用户永久停留在旧版本。**修改以下任何文件前必须停下来说明原因与影响，获得用户明确同意**：`frontend/src/services/upgrade.ts`、`App.tsx` 的 checkUpdate 调用、`vite.config.ts` 版本注入、`frontend/package.json` 的 version 字段（仅 `npm version` 自然递增除外）、`scripts/upload-apk.js`、Supabase `app_versions` 表与 Storage `apk` bucket、`LoginPage.tsx` 版本号显示。

`version_code` 必须由公式 `MAJOR×10000 + MINOR×100 + PATCH` 推导（ADR-005），发版脚本与 `upgrade.ts` 各算一次，两处算法必须一致——不要改回 max+1 递增。

## Agent skills

### Issue tracker

工作以本地 Markdown 原子 Ticket 追踪（`README.tickets.md` / `SPEC/*.tickets.md`），不使用 GitHub Issues。See `docs/agents/issue-tracker.md`.

### Triage labels

使用默认五标签：`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`。See `docs/agents/triage-labels.md`.

### Domain docs

单上下文：根 `CONTEXT.md`（SmartFAB 术语）+ `SPEC/GLOSSARY.md`（全局术语）+ `SPEC/ADRs/`（架构决策）。See `docs/agents/domain.md`.
