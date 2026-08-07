# Fuel Records — 任务拆解清单

> 基于 [README.md](./README.md) 规格书的 8 期迭代计划，拆解为原子任务。

---

## 图例

- `[ ]` — 待办
- `[x]` — 已完成
- **依赖**：标注该任务的前置任务编号
- **难度**：★（入门）★★（进阶）★★★（挑战）

---

## 教学方式

**教学粒度**：以每个子章节（如 1.1.1、1.1.2、1.2.1）为一个教学节点，不是以整个 Ticket 为节点。每个子章节都要走完完整的 7 步教学流程后，再进入下一个子章节。

每个子章节的执行方式必须严格按照如下步骤，不能有任何偏差、不能有任何错误、不能有任何遗漏：

1. **我先讲概念**：用大白话解释这个子章节涉及的每个新概念（比如"什么是 ORM"、"FastAPI 路由怎么工作"）
2. **逐行写代码**：我写一行，解释一行，并将当前用到的 Python 语法逐个讲清楚，然后你跟着写一行
3. **你提问我回答**：任何一行不理解，随时打断我问
4. **做总结**：子章节完成后，我会用大白话总结你刚学到的所有知识点
5. **出题检测**：总结完后，我会出 2-3 道题目来检测你的掌握情况，题目必须覆盖：
   - 当前子章节的核心知识点
   - 之前子章节的关联知识点（防止学完就忘）
   - 题目形式不限：口述解释、写代码片段、填空、判断对错均可
   - 你回答后我会点评，如果回答正确→进入第 6 步；如果错误→我会重新讲解该知识点，直到你弄懂
6. **确认后才前进**：出题检测通过后，我会明确问你——"这个子章节的所有内容你都完全理解了吗？"
   - 你说"理解了"，我才进入下一个子章节
   - 你说"还有不明白"，我会继续讲，直到你彻底搞懂
   - **我绝不默认你懂了，也绝不自己判断你懂了**
7. **更新 DIR.md**：每个子章节完成后，我会同步更新 [`DIR.md`](./DIR.md)，将本次新增或修改的目录/文件信息写进去，方便你日后回顾整个项目结构

> **核心原则**：不走"先抄后理解"的路，而是每一步都理解透了再走下一步。哪怕一个 Ticket 花几个小时，也要确保你是真懂了，而不是"跑通了但不知道为什么"。

## Phase 1 — "Hello 油耗"（最小可用版）

> **目标**：单人单车辆，手机上能真实录入加油记录、看到油耗。

### Ticket 1.1: 项目骨架搭建 — FastAPI 后端

- [x] **1.1.1 初始化项目目录结构**
  - 创建 `backend/` 目录及所有子目录（`models/`, `schemas/`, `routers/`, `services/`, `core/`）
  - 创建 `__init__.py` 使各目录为 Python 包
  - 创建 `requirements.txt`（fastapi, uvicorn, sqlalchemy, psycopg2-binary, pydantic, python-dotenv, loguru）
  - **依赖**：无
  - **难度**：★

- [x] **1.1.2 主入口 main.py**
  - 创建 `FastAPI` 应用实例
  - 挂载 CORS 中间件（允许 React 前端跨域调用）
  - 注册路由前缀 `/api/v1`
  - 实现 `GET /api/v1/health` 健康检查接口
  - **依赖**：1.1.1
  - **难度**：★

- [x] **1.1.3 配置管理 config.py**
  - 使用 `pydantic-settings` 或 `python-dotenv` 读取 `.env`
  - 配置项：数据库连接串、日志级别、服务端口
  - 创建 `.env.example` 模板
  - **依赖**：1.1.1
  - **难度**：★

- [x] **1.1.4 日志配置 logger.py**
  - 集成 loguru，配置日志格式、轮转、保存路径
  - **依赖**：1.1.1
  - **难度**：★

- [x] **1.1.5 数据库连接 database.py**
  - 创建 SQLAlchemy `engine` 和 `SessionLocal` 工厂
  - 创建 `Base` 声明基类
  - 提供 `get_db` 依赖注入函数
  - 配置连接池（pool_size=5, max_overflow=10）
  - **依赖**：1.1.2, 1.1.3
  - **难度**：★★

### Ticket 1.2: 数据模型与 API — 加油记录

- [x] **1.2.1 创建 FuelRecord ORM 模型**
  - `models/fuel_record.py`：定义 FuelRecord 表
  - 字段：id, mileage, fuel_volume, fuel_cost, unit_price(计算), is_full_tank, is_baseline, fuel_consumption, note, record_date, created_at
  - **依赖**：1.1.5
  - **难度**：★★

- [x] **1.2.2 创建 Pydantic Schema**
  - `schemas/record.py`：
    - `FuelRecordCreate`（mileage, fuel_volume, fuel_cost, is_full_tank, note）
    - `FuelRecordResponse`（所有字段 + fuel_consumption）
    - `FuelRecordUpdate`（可选字段）
    - 校验规则：mileage>0, fuel_volume>0, fuel_cost>0
  - **依赖**：1.2.1
  - **难度**：★

- [x] **1.2.3 实现油耗计算服务**
  - `services/record_service.py`：
    - `create_record()`：写入新记录
      - 查询上一条记录（按 record_date 排序）
      - 如无上一条 → 标记 `is_baseline=True`, `fuel_consumption=None`
      - 如有上一条且 `is_full_tank=True` → 计算 `fuel_consumption = (当前里程 - 上次里程) / 当前油量 × 100`
    - `get_records()`：分页查询（按时间倒序）
    - 里程校验：新记录的里程不能小于上一条记录的里程
  - **依赖**：1.2.1
  - **难度**：★★★

- [x] **1.2.4 实现加油记录路由**
  - `routers/records.py`：
    - `POST /api/v1/records` → 调用 record_service.create_record()
    - `GET /api/v1/records` → 调用 record_service.get_records()（支持分页参数）
  - 挂载路由到 main.py
  - **依赖**：1.2.2, 1.2.3
  - **难度**：★★

### Ticket 1.3: 本地开发环境搭建

- [x] **1.3.1 本地启动 PostgreSQL**（通过 Supabase 测试库）
  - 无需本地安装数据库，直连 Supabase 测试项目 `fuel-records-test`
  - 配置 `.env` 中 `DB_TYPE=postgresql_test` + `DB_PG_URL_TEST`
  - **依赖**：无
  - **难度**：★

- [x] **1.3.2 本地验证后端**
  - `pip install -r requirements.txt`
  - `uvicorn main:app --reload`
  - 访问 `http://127.0.0.1:8000/docs` 打开 Swagger
  - 调用 POST /api/v1/records 测试数据写入
  - 调用 GET /api/v1/records 验证数据返回
  - **依赖**：1.1.5, 1.2.4, 1.3.1
  - **难度**：★

### Ticket 1.4: Docker 容器化

- [x] **1.4.1 编写 Dockerfile**
  - 基于 `python:3.12-slim`
  - 复制 `requirements.txt` 并 `pip install`
  - 复制后端代码
  - CMD 运行 uvicorn
  - **依赖**：1.1.2, 1.2.4
  - **难度**：★★

- [x] **1.4.2 编写 docker-compose.yml**
  - 定义两个 service：`app`（FastAPI）+ `db`（PostgreSQL）
  - `db`：挂载 volume 持久化数据，配置环境变量（POSTGRES_PASSWORD, POSTGRES_DB）
  - `app`：映射端口 8000:8000，依赖 db，读取 `.env`
  - **依赖**：1.4.1
  - **难度**：★★

- [x] **1.4.3 本地 Docker 验证**
  - `docker-compose up -d` 启动
  - 验证 PostgreSQL 和 FastAPI 均正常运行
  - 调用 API 验证数据写入/读取
  - **依赖**：1.4.2
  - **难度**：★

### Ticket 1.5: Render + Supabase 部署（Phase 1 最终上线）

> **背景**：原计划使用 Oracle Cloud VPS，但因注册失败（免费 4 核 24G 审核严格），切换为 Render（免费后端托管）+ Supabase（免费 PostgreSQL）方案。

- [x] **1.5.1 注册 Supabase 并创建项目**
  - 访问 [supabase.com](https://supabase.com)，GitHub 账号登录
  - 创建新项目（选一个 Region，设数据库密码）
  - 项目创建后，进入 **Project Settings → Database → Connection string**
  - 复制 `URI` 格式的连接串（`postgresql://postgres:xxxx@xxxx:6543/postgres`）
  - **依赖**：无
  - **难度**：★

- [x] **1.5.2 注册 Render 并连接 GitHub**
  - 访问 [render.com](https://render.com)，GitHub 账号登录
  - 点击 **New + → Web Service**
  - 连接 GitHub，选择本项目仓库
  - 填写配置：
    - **Name**: `fuel-records-api`
    - **Region**: 选最近的（如 Singapore）
    - **Branch**: `main`
    - **Runtime**: `Python 3`
    - **Build Command**: `pip install -r backend/requirements.txt`
    - **Start Command**: `cd backend && uvicorn main:app --host 0.0.0.0 --port 10000`
  - 选择 **Free** 计划
  - 点击 **Create Web Service**
  - **依赖**：1.5.1, 需要代码已推送到 GitHub
  - **难度**：★★

- [x] **1.5.3 配置环境变量**
  - 在 Render Dashboard → **Environment** 页面添加：
    - `DB_TYPE`: `postgresql`
    - `DB_PG_URL`: 从 Supabase 复制的连接串
    - `APP_DEBUG`: `false`
  - 保存后 Render 自动重新部署
  - **依赖**：1.5.2
  - **难度**：★

- [x] **1.5.4 验证 API 在线可用**
  - Render 部署完成后，访问 `https://fuel-records.onrender.com/api/v1/health`
  - 应返回 `{"status": "ok", "version": "1.0.0"}`
  - 调用 `POST /api/v1/records` 测试数据写入
  - 调用 `GET /api/v1/records` 验证数据返回
  - **依赖**：1.5.3
  - **难度**：★

- [ ] **1.5.5 （可选）配置自定义域名**
  - 在 Render Dashboard → **Settings → Custom Domain** 添加域名
  - 在域名 DNS 管理平台添加 CNAME 记录指向 Render 服务
  - Render 自动申请并续期 SSL 证书（免费自带）
  - **依赖**：1.5.4
  - **难度**：★★

### Ticket 1.6: React + Capacitor 前端 — 第一个页面

- [x] **1.6.1 初始化 React + Vite 项目**
  - `npm create vite@latest frontend -- --template react-ts`
  - 安装依赖：`axios`（HTTP 请求）
  - 配置 Vite 代理（开发时转发 `/api` 到后端 `localhost:8000`）
  - **依赖**：无
  - **难度**：★

- [x] **1.6.2 实现记录录入表单**
  - 一个页面：顶部表单 + 底部记录列表
  - 三个输入框：里程（type=number）、油量（type=number）、金额（type=number）
  - 一个"提交"按钮，提交后调用 `POST /api/v1/records`
  - 提交成功后清空表单，调用列表刷新
  - 提交中按钮 disabled + 显示 loading 文字
  - 网络错误弹出提示（`alert` 或自定义 toast）
  - **依赖**：1.6.1, 1.2.4
  - **难度**：★★

- [x] **1.6.3 实现记录列表**
  - 表单下方展示所有加油记录（倒序排列）
  - 每行显示：里程、油量、金额、油耗（如有）、日期
  - 基线记录特殊标记（灰色显示"基线"）
  - 空状态：显示"还没记录，去加一箱油吧"
  - **依赖**：1.6.1, 1.2.4
  - **难度**：★★

- [x] **1.6.4 集成 Capacitor 打包 APK**
  - `npm install @capacitor/core @capacitor/cli @capacitor/android`
  - `npx cap init` + `npx cap add android`
  - 构建前端：`npm run build`
  - 同步到原生：`npx cap sync`
  - 配置 Gradle 腾讯云镜像（国内网络加速）
  - 编译 APK：`./gradlew assembleDebug`
  - 将 APK 传到 Huawei Mate40 Pro 安装
  - 验证 API 连通性
  - 踩坑记录及修复：Gradle 下载超时、JDK 24 不兼容、Kotlin stdlib 冲突 → 见 `APK-BUILD-GUIDE.md`
  - **依赖**：1.6.2, 1.6.3, 1.5.4
  - **难度**：★★

---

## Phase 2 — "CRUD 完整版"

> **目标**：支持编辑和删除已有记录，数据修改后自动重新计算油耗。

### Ticket 2.1: 后端 — 修改与删除 API

- [x] **2.1.1 实现修改记录 PUT 接口**
  - `PUT /api/v1/records/{id}`
  - 校验记录是否存在（404 兜底）
  - 里程修改后，检查是否影响上一条/下一条记录的油耗计算
  - **依赖**：1.2.3, 1.2.4
  - **难度**：★★★

- [x] **2.1.2 实现删除记录 DELETE 接口**
  - `DELETE /api/v1/records/{id}`
  - 删除后重新计算后继记录的油耗（如果删除的是中间记录）
  - 不允许删除唯一的基线记录（需先提示）
  - **依赖**：2.1.1
  - **难度**：★★★

- [x] **2.1.3 级联油耗重算工具函数**
  - 封装 `recalculate_consumption(db, from_record_date)` 函数
  - 被修改/删除影响的所有后继记录统一重算
  - **依赖**：2.1.1
  - **难度**：★★★

### Ticket 2.2: React 前端 — 编辑与删除交互

- [x] **2.2.1 记录列表支持删除**
  - 每条记录加"删除"按钮（小红色图标）
  - 点击后弹出 `window.confirm` 确认对话框
  - 确认后调用 `DELETE /api/v1/records/{id}`
  - 删除成功后刷新列表
  - **依赖**：1.6.3, 2.1.2
  - **难度**：★★

- [x] **2.2.2 记录编辑功能**
  - 每条记录加"编辑"按钮
  - 点击后将当前记录数据填入顶部表单
  - 提交按钮文字变为"更新"
  - 提交后调用 `PUT /api/v1/records/{id}`
  - 成功后表单恢复"提交"状态，刷新列表
  - **依赖**：1.6.2, 2.1.1
  - **难度**：★★

---

## Phase 3 — "上云"（已含在 Phase 1 Ticket 1.5）

> **注意**：Phase 1 已经包含了 Render + Supabase 注册、部署、环境配置的所有任务。
> 此阶段作为部署后的运维巩固。

- [x] **3.1 部署运维巩固**
  - 学会查看 Render 日志：Render Dashboard → Logs
  - 学会手动重新部署：Render Dashboard → Manual Deploy → Clear Build Cache & Deploy
  - 学会更新代码：`git push` 到 main → Render 自动重新部署
  - **依赖**：1.5.4
  - **难度**：★★

- [ ] **3.2 域名绑定（可选）**
  - 购买或使用免费域名（如 duckdns.org）
  - 在 Render Dashboard → Settings → Custom Domain 绑定域名
  - Render 自动配置 SSL 证书
  - **依赖**：1.5.5
  - **难度**：★

---

## Phase 4 — "用户来了"（鉴权）

> **目标**：引入用户系统，加油记录归属到用户，API 受 JWT 保护。

### Ticket 4.1: 后端 — 用户模型与认证

- [x] **4.1.1 创建 User ORM 模型**
  - `models/user.py`：id, username(unique), email(unique), hashed_password, is_active, created_at, updated_at
  - 新增 `fuel_records.user_id` 字段（ALTER TABLE）
  - 建立 User ↔ FuelRecord 一对多关系
  - **依赖**：1.1.5
  - **难度**：★★

- [x] **4.1.2 密码哈希工具**
  - `core/security.py`：
    - 集成 `passlib` 或 `bcrypt` 实现 `hash_password()` 和 `verify_password()`
  - **依赖**：4.1.1
  - **难度**：★

- [x] **4.1.3 JWT 工具函数**
  - `generate_access_token(user_id, expires_delta)` → 返回 JWT 字符串
  - `verify_access_token(token)` → 返回 user_id 或抛出异常
  - 配置 JWT_SECRET 和 JWT_ALGORITHM 到 `.env`
  - 支持 refresh_token 机制（简单版，access_token 过期时间 24h）
  - **依赖**：4.1.1
  - **难度**：★★

- [x] **4.1.4 注册与登录路由**
  - `POST /api/v1/auth/register`：用户名+密码 → 创建用户 → 返回 JWT
  - `POST /api/v1/auth/login`：用户名+密码 → 验证 → 返回 JWT
  - 用户名唯一性校验、长度限制
  - 密码强度校验（至少 6 位）
  - **依赖**：4.1.2, 4.1.3
  - **难度**：★★

- [x] **4.1.5 JWT 依赖注入中间件**
  - `core/deps.py`：
    - `get_current_user` 依赖：从 Authorization header 提取 Bearer token → 验证 → 返回当前用户
  - 应用到所有 `/api/v1/records` 路由
  - **依赖**：4.1.3, 4.1.4
  - **难度**：★★

### Ticket 4.2: 后端 — 数据隔离

- [x] **4.2.1 加油记录关联用户**
  - 所有 record 操作自动填充 `user_id`（从当前 token 获取）
  - 查询时按 `user_id` 过滤，用户只能看到自己的记录
  - 修改/删除时校验 `user_id`
  - **依赖**：4.1.5, 1.2.3
  - **难度**：★★

### Ticket 4.3: React 前端 — 登录页面

- [x] **4.3.1 登录/注册页面**
  - 两个 Tab 切换：登录 / 注册
  - 登录：用户名输入框 + 密码输入框 + 登录按钮
  - 注册：用户名输入框 + 密码输入框 + 确认密码输入框 + 注册按钮
  - 表单校验（非空、密码一致、长度限制）
  - 调用 `POST /api/v1/auth/login` 或 `POST /api/v1/auth/register`
  - **依赖**：4.1.4
  - **难度**：★★

- [x] **4.3.2 Token 持久化**
  - 登录成功后保存 JWT 到 `localStorage`
  - 封装 `apiClient`（axios 实例），自动在 header 添加 `Authorization: Bearer <token>`
  - 401 时自动清除 token 并跳转登录页
  - **依赖**：4.3.1
  - **难度**：★★

- [x] **4.3.3 路由守卫**
  - 使用 React Router 实现路由守卫
  - 未登录 → 显示登录页
  - 已登录 → 显示记录列表页
  - 退出登录 → 清除 localStorage → 回到登录页
  - **依赖**：4.3.2
  - **难度**：★★

---

## Phase 5 — "多车管理"

> **目标**：支持 KPT400 摩托车和汽车分别记录油耗。

### Ticket 5.1: 后端 — 车辆模型与 API

- [x] **5.1.1 创建 Vehicle ORM 模型**
  - `models/vehicle.py`：id, user_id(FK), name, plate(可选), initial_mileage, is_active, created_at
  - 关联 User（多对一）
  - 关联 FuelRecord（一对多）
  - 迁移：fuel_records 表新增 vehicle_id 字段
  - **依赖**：4.1.1
  - **难度**：★★

- [x] **5.1.2 车辆 CRUD 路由**
  - `POST /api/v1/vehicles` — 创建车辆（需指定初始里程）
  - `GET /api/v1/vehicles` — 当前用户的车辆列表
  - `PUT /api/v1/vehicles/{id}` — 修改车辆信息
  - `DELETE /api/v1/vehicles/{id}` — 删除车辆（校验有无关联记录）
  - **依赖**：5.1.1
  - **难度**：★★

- [x] **5.1.3 加油记录关联车辆**
  - 创建记录时需指定 vehicle_id
  - 查询时默认展示最近使用的车辆
  - 油耗计算按 vehicle_id 分组独立计算
  - **依赖**：5.1.1, 1.2.3
  - **难度**：★★

### Ticket 5.2: React 前端 — 多车管理 UI

- [x] **5.2.1 车辆列表页**
  - 首页展示用户的所有车辆（卡片形式）
  - 显示每辆车的名称、总里程、平均油耗摘要
  - 点击进入该车辆的加油记录页
  - **依赖**：5.1.2
  - **难度**：★★

- [x] **5.2.2 添加/编辑车辆页面**
  - 表单：名称、车牌号（可选）、初始里程
  - 创建后跳转到该车记录页
  - **依赖**：5.2.1
  - **难度**：★★

- [x] **5.2.3 车辆切换与默认车辆**
  - 记录页顶部 `select` 下拉框切换车辆
  - 默认选中最近使用的车辆（存 localStorage）
  - 创建记录时自动绑定当前选中的车辆
  - **依赖**：5.2.1, 4.3.3
  - **难度**：★

---

## Phase 6 — "数据之美"

> **目标**：统计汇总数据，可视化呈现。

### Ticket 6.1: 后端 — 统计 API

- [x] **6.1.1 汇总统计接口**
  - `GET /api/v1/stats/summary?vehicle_id=X`
  - 返回：总里程（最后一笔 - 第一笔）、总加油量、总金额、平均油耗、平均单价
  - SQLAlchemy 聚合查询（`func.sum`, `func.avg`, `func.count`）
  - **依赖**：5.1.1
  - **难度**：★★

- [x] **6.1.2 月度统计接口**
  - `GET /api/v1/stats/monthly?vehicle_id=X&year=2026`
  - 返回：每月加油次数、总油量、总金额、平均油耗
  - SQLAlchemy `extract` + `GROUP BY` 分组
  - **依赖**：6.1.1
  - **难度**：★★

### Ticket 6.2: React 前端 — 统计页面

- [x] **6.2.1 概览统计卡片页**
  - 展示：总里程、平均油耗、总花费、总加油量
  - 大号数字 + 标签，CSS 卡片布局美观排版
  - **依赖**：6.1.1
  - **难度**：★★

- [x] **6.2.2 月度折线图**
  - 集成 Recharts 库
  - X 轴：月份，Y 轴：油耗 + 花费（双轴）
  - 展示月度油耗变化趋势
  - **依赖**：6.1.2, 6.2.1
  - **难度**：★★

- [x] **6.2.3 历史记录搜索与筛选**
  - 按日期范围筛选（两个 date input）
  - 按是否加满筛选（checkbox）
  - 搜索备注文字（如按加油站名搜索）
  - **依赖**：1.2.4
  - **难度**：★★

---

## Phase 7 — "生产级"

> **目标**：代码质量、自动化、可靠性保障。

### Ticket 7.1: 数据库迁移（Alembic）

- [x] **7.1.1 集成 Alembic**
  - `alembic init alembic`
  - 配置 `alembic.ini` 连接数据库
  - 编写 `env.py`（自动检测 models 变更）
  - 生成初始迁移脚本
  - 掌握：`alembic revision --autogenerate` + `alembic upgrade head`
  - **依赖**：1.1.5
  - **难度**：★★

### Ticket 7.1: 数据库迁移

- [x] **7.2.1 测试基础设施**
  - 集成 pytest
  - 使用 `TestClient`（FastAPI 自带）模拟 HTTP 请求
  - 使用 PostgreSQL 测试数据库做测试隔离
  - 创建 `conftest.py` 定义 fixture
  - **依赖**：1.1.2
  - **难度**：★★

- [x] **7.2.2 核心业务逻辑测试**
  - 测试油耗计算：基线记录、正常计算、非加满跳过
  - 测试级联重算：修改/删除中间记录后油耗是否正确
  - 测试里程校验：新里程不能小于上次里程
  - **依赖**：7.2.1, 1.2.3
  - **难度**：★★

- [x] **7.2.3 API 接口测试**
  - 测试 CRUD 各接口正常/异常路径
  - 测试鉴权：无 token 请求返回 401
  - 测试数据隔离：A 用户不能操作 B 用户的记录
  - **依赖**：7.2.1, 4.1.5, 5.1.2
  - **难度**：★★

### Ticket 7.3: CI/CD

- [ ] **7.3.1 GitHub Actions 配置**
  - 创建 `.github/workflows/deploy.yml`
  - 触发条件：push 到 main 分支
  - Step：
    1. Checkout 代码
    2. 运行 pytest 测试
    3. 测试通过后 build Docker 镜像
    4. SSH 到 VPS 拉取新镜像并重启容器
  - **依赖**：7.2.3, 1.5.4
  - **难度**：★★★

### Ticket 7.4: API 版本管理

- [ ] **7.4.1 路由版本化**
  - 当前 `/api/v1/` 路径前缀保持
  - 后续新版本建 `/api/v2/`，旧路由不删除
  - 文档中标注版本差异
  - **依赖**：1.1.2
  - **难度**：★

---

## Phase 8 — "锦上添花"

> **目标**：用户体验完善，更像一个正式产品。

### Ticket 8.1: 暗黑模式

- [x] **8.1.1 暗黑模式**
  - React 端使用 CSS 变量 + `prefers-color-scheme` 媒体查询
  - 手动切换按钮（存 localStorage 记住偏好），三态循环：自动/亮色/暗色
  - **依赖**：1.6.3
  - **难度**：★

- [x] **8.1.2 加油提醒推送（已移除）**
  - 使用浏览器 Notification API
  - 设置提醒周期（每 7 天弹出通知）
  - **P10 重构时移除，功能未验证可行**
  - **依赖**：1.6.4
  - **难度**：★★

- [x] **8.1.3 记录分享截图（已移除）**
  - 使用 `html2canvas` 库截图统计页面
  - 支持分享（navigator.share）或保存为图片
  - **P10 重构时移除，简化统计页 UI**
  - **依赖**：8.2.1
  - **难度**：★★

### Ticket 8.2: 性能优化

- [x] **8.2.1 数据库索引优化**
  - 添加复合索引 `ix_fuel_records_user_vehicle_date` (user_id, vehicle_id, record_date)
  - 添加单列索引 `ix_vehicles_user_id` (user_id)
  - 添加单列索引 `ix_fuel_records_record_date` (record_date)
  - Alembic 迁移：`24b921f41e3b_add_performance_indexes.py`
  - **依赖**：1.1.5
  - **难度**：★★

- [x] **8.2.2 前端列表性能**
  - 分页加载：每页 20 条，底部"加载更多"按钮
  - 显示加载进度（已加载/总数）
  - 切换车辆/应用筛选时自动重置到第 1 页
  - **依赖**：1.6.3
  - **难度**：★★

### Ticket 8.3: UI 美学升级（/ui-taste 注射）

- [x] **8.3.1 CSS 动画与微动效**
  - 8 个 @keyframes：fadeInUp / scaleIn / bgShift / shimmer / glowPulse / float
  - 页面加载入场动画（列表项逐条从下方淡入，统计卡片交错延迟）
  - 按钮 hover shimmer 扫过效果 + click 缩放反馈（scale(0.96)）
  - 提交按钮光晕脉冲呼吸动画（glowPulse 3s）
  - **依赖**：8.1, 6.2.1
  - **难度**：★★

- [x] **8.3.2 玻璃态与视觉层级**
  - 卡片：`backdrop-filter: blur(20px)` + 半透明底色 + 多层弥散微投影
  - 背景：对角渐变游走（body 20s 渐变色位移）+ 装饰光斑（::before/::after 巨型径向渐变球浮动）
  - 统计卡片：4 色渐变顶部装饰线（靛紫/琥珀/翠绿/蓝），hover 时伸长
  - 标题：靛紫渐变色 background-clip: text
  - 大圆角系统：卡片 18px / 按钮 12-14px / 输入框 12px
  - **依赖**：8.3.1
  - **难度**：★★

- [x] **8.3.3 暗色模式增强**
  - 暗色模式下：深邃迷幻底色（#0f172a）+ 光斑换为深紫/深蓝
  - 亮色模式下：中性微灰色调底色（#f8fafc）+ 光斑换为暖橙/靛蓝
  - 所有颜色通过 CSS 变量（--bg / --card-bg / --text 等）自动切换
  - **依赖**：8.1, 8.3.2
  - **难度**：★

- [x] **8.3.4 Python 3.9 兼容 + 认证修复**
  - `X | None` 语法 → `Optional[X]` 标准写法（7 文件：schemas 4 个 + services/record_service + routers/records + core/deps）
  - `core/deps.py`：`HTTPBearer(auto_error=False)` 修复无 Token 时错误返回 403 → 401
  - 零新依赖，纯 `from typing import Optional`
  - **依赖**：7.2.3, 4.1.5
  - **难度**：★

---

## Phase 10 — "个人记账"

> **目标**：在 App 中新增独立的个人记账模块。用户共享、数据隔离，三级分类体系 + 多维度统计图表。
> **规格书**：[`EXPENSE_SPEC.md`](./SPEC/EXPENSE_SPEC.md)

### Ticket 10.1: 后端 — 数据模型与迁移

- [x] **10.1.1 创建 ExpenseCategory ORM 模型**
  - `models/expense_category.py`：id, user_id(FK), parent_id(FK→self), name, level(1/2/3), sort_order, created_at, updated_at
  - 树形自引用结构（parent_id=NULL 为一级分类）
  - 关联 User（多对一）
  - **依赖**：1.1.5（数据库连接）
  - **难度**：★★

- [x] **10.1.2 创建 Expense ORM 模型**
  - `models/expense.py`：id, user_id(FK), amount(>0), category_l1/l2/l3(冗余存储), note, expense_date, created_at, updated_at
  - 关联 User（多对一）
  - **依赖**：10.1.1
  - **难度**：★

- [x] **10.1.3 补充 User 模型级联关系**
  - `models/user.py`：添加 `expenses` 和 `categories` 两个 relationship（`cascade="all, delete-orphan"`）
  - **依赖**：10.1.1, 10.1.2
  - **难度**：★

- [x] **10.1.4 Alembic 迁移 + 现有文件导入更新**
  - 生成迁移脚本（expenses + expense_categories 表 + 4 个索引）
  - 更新 `models/__init__.py`：导入 Expense, ExpenseCategory
  - 更新 `alembic/env.py`：导入两个新模型
  - 更新 `database.py`：`init_db()` 导入两个新模型
  - **依赖**：10.1.3
  - **难度**：★★

### Ticket 10.2: 后端 — Schema 与 Service

- [x] **10.2.1 Pydantic Schema**
  - `schemas/expense.py`：ExpenseCreate/Update/Response + CategoryCreate/Update/Response
  - `schemas/expense_stats.py`：BreakdownItem/PeriodItem/StatsResponse（注意与 fuel 统计的 `schemas/stats.py` 区分）
  - 校验：amount > 0、category_l1/l2/l3 非空、expense_date 格式
  - **依赖**：10.1.2
  - **难度**：★★

- [x] **10.2.2 支出记录业务逻辑**
  - `services/expense_service.py`：
    - `create_expense()`：校验分类链（L1→L2→L3 父子关系）+ 分类存在 + 属于当前用户
    - `get_expenses()`：分页查询（按 user_id + category_l1/l2/l3 + 日期范围，日期倒序）
    - `update_expense()`：修改 + 重新校验分类链 + 校验归属
    - `delete_expense()`：校验归属后删除
  - **依赖**：10.2.1
  - **难度**：★★★

- [x] **10.2.3 统计聚合逻辑**
  - `services/expense_stats_service.py`：
    - `get_stats()`：多维度聚合
      - `group_by="none"` → total_amount/record_count/avg_daily + L1+L2+L3 全层级扁平列表
      - `group_by="month/week/year"` → 分时段 items（含 breakdown）
    - **跨数据库兼容**：PostgreSQL 用原生 `GROUP BY ROLLUP(category_l1, category_l2, category_l3)`
    - 支持分类过滤
  - **依赖**：10.2.1
  - **难度**：★★★

### Ticket 10.3: 后端 — 路由注册

- [x] **10.3.1 支出记录路由**
  - `routers/expenses.py`：POST/GET/PUT/DELETE `/api/v1/expenses`
  - 全部需 JWT 鉴权（`get_current_user`）
  - **依赖**：10.2.2
  - **难度**：★★

- [x] **10.3.2 分类管理 + 统计路由**
  - `routers/expense_categories.py`：分类 CRUD + `GET /api/v1/expenses/stats`
  - 创建分类时 `level` 自动计算（禁止前端传入）
  - 修改分类禁止改 `parent_id`
  - 删除分类校验子分类 + 关联记录
  - 在 `main.py` 注册两个新路由
  - **依赖**：10.2.2, 10.2.3
  - **难度**：★★

### Ticket 10.4: 前端 — 全局导航重构

- [x] **10.4.1 TopBar + BottomNav 组件**
  - `components/TopBar.tsx`：40px 顶栏，左侧 App 名称，右侧主题切换 + ⚙ 设置齿轮（P11 变更：退出登录移入 SettingsModal）
  - `components/BottomNav.tsx`：底部固定双 Tab 导航（⛽ 油耗 / 💰 记账）
  - 主题切换通过 `localStorage` + `data-theme` 属性共享
  - **依赖**：8.2.1（暗黑模式 CSS 变量）
  - **难度**：★★

- [x] **10.4.2 main.tsx 路由改造**
  - 包裹 TopBar + BottomNav + Outlet（除 /login 外）
  - 路由变更：`/` → 重定向 `/fuel`，`/stats` → `/fuel/stats`，新增 `/expense`
  - 登录页不显示导航（保持独立主题按钮）
  - **依赖**：10.4.1
  - **难度**：★★

- [x] **10.4.3 App.tsx 拆分**
  - 主题切换 → 移到 TopBar
  - 退出登录 → 移到 SettingsModal（P11 变更）
  - 保留：车辆选择器、加油表单、记录列表、筛选、版本更新检测、分页
  - **依赖**：10.4.2
  - **难度**：★★

### Ticket 10.5: 前端 — 记账主页面

- [x] **10.5.1 类型定义 + API 函数**
  - `services/api.ts` 新增：Expense/ExpenseCategory/Stats 类型 + 全部 API 函数
  - 复用现有 axios 拦截器（自动 token + 401 跳转）
  - **依赖**：10.3.2
  - **难度**：★

- [x] **10.5.2 ExpensePage 页面骨架**
  - `pages/ExpensePage.tsx`：金额 → 分类 → 日期 → 备注 → 提交 → 列表 → 底部面板入口
  - `pages/ExpensePage.css`：独立样式（复用 CSS 变量主题系统）
  - 状态管理：amount/selectedL1-L3/date/note/editingId/expenses[]
  - **依赖**：10.5.1
  - **难度**：★★

- [x] **10.5.3 AmountInput + DatePicker + NoteInput**
  - 大号 `<input type="number" inputmode="decimal">` + CSS 大字号
  - 日期默认当天（`<input type="date">`）
  - 可选备注文本框
  - 提交按钮大号圆角，提交中 disabled + loading
  - **依赖**：10.5.2
  - **难度**：★

- [x] **10.5.4 CategoryPicker（三级级联）**
  - 挂载时调 `GET /categories` 获取分类树
  - 选 L1 → 筛 L2 → 选 L2 → 筛 L3
  - 每级末尾"+ 新建"（弹出快速创建，回车自动选中）
  - 冷启动：L1 显示"+ 新建"
  - 编辑模式：回填当前分类
  - **依赖**：10.5.2
  - **难度**：★★★

- [x] **10.5.5 ExpenseList（历史记录 + 左滑删除）**
  - 日期倒序，显示 `餐饮 / 午餐 / 外卖`（颜色递减灰阶）+ 金额/备注/日期
  - 编辑按钮 → 回填表单 → 提交变"更新"
  - 删除按钮 → `window.confirm` 确认
  - 左滑删除手势（CSS `translateX` + `touchstart/touchend`）
  - 分页"加载更多"（每页 20 条）
  - 空状态："还没记过账"
  - **依赖**：10.5.2
  - **难度**：★★★

### Ticket 10.6: 前端 — 底部弹出面板

- [x] **10.6.1 BottomPanel 容器**
  - 弹出/收起动画（`transform: translateY`）
  - 打开时锁定 body 滚动
  - 内部双 Tab：分类管理 / 统计图表
  - `components/BottomPanel.tsx`
  - **依赖**：10.5.2
  - **难度**：★★

- [x] **10.6.2 CategoryManager（分类管理）**
  - 树形展示（一级→二级→三级）
  - 添加子分类 / 内联编辑 / 删除（校验子分类 + 关联记录）
  - **依赖**：10.6.1
  - **难度**：★★

- [x] **10.6.3 StatsPanel 统计图表**
  - 时间快捷选择：本月/本年/近一周/自定义（默认"本月"）
  - 安装依赖：`npm install @nivo/sunburst @nivo/core`（已废弃 — 旭日图改用 recharts 三环 Pie 嵌套，P10.6 体验优化后移除 @nivo）
  - 三环旭日图（recharts 嵌套 Pie）+ 堆叠柱状图（recharts BarChart，图例下钻 L1→L2→L3）+ 饼图下钻（recharts）+ 明细表
  - 数据流：`fetchExpenseStats()` → 扁平列表 → `buildTree()` → 图表
  - 空数据时灰色占位
  - **依赖**：10.6.1
  - **难度**：★★★

### Ticket 10.7: 集成与测试

- [x] **10.7.1 前后端联调**
  - 本地启动验证全流程：底部导航切换、分类 CRUD、支出 CRUD、统计图表、旧路由重定向、登录页隔离
  - **依赖**：10.6.3
  - **难度**：★

- [x] **10.7.2 后端测试**
  - 更新 `tests/conftest.py`：client fixture 注册 2 个新路由
  - `tests/test_expense_services.py`：CRUD + 分类链校验 + 级联删除保护 + 统计聚合
  - `tests/test_expense_api.py`：端点 + 鉴权 + 数据隔离
  - 运行 `pytest` 确保全部通过
  - **依赖**：10.3.2, 10.7.1
  - **难度**：★★

- [x] **10.7.3 文档更新 + 构建验证**
  - 更新 `DIR.md`：新增/修改文件的目录结构说明
  - 更新 `test-specs/e2e-test-spec.md`：记账模块测试清单
  - 构建 APK 验证：@nivo 包增加约 25KB gzip
  - **依赖**：10.7.2
  - **难度**：★

---

## Phase 10.5 — "导航与统计重构"（2026-08-01）

> **目标**：底部抽屉 → 全屏独立页面，智能 FAB 导航，统计图表功能增强。

### Ticket 10.5.1: 抽屉 → 全屏页面

- [x] **10.5.1.1 删除 BottomPanel 抽屉**
  - 删除 `components/BottomPanel.tsx` + `.css`
  - 从 App.tsx 和 ExpensePage.tsx 移除 `showPanel` 状态、FAB、BottomPanel 引用
  - **依赖**：10.6.1
  - **难度**：★

- [x] **10.5.1.2 新建 ExpenseStatsPage 全屏统计页**
  - `pages/ExpenseStatsPage.tsx`：汇总卡片（带彩色顶部装饰线） + 饼图下钻/堆叠柱状图（图例下钻）/三环旭日图 + 折叠式分类管理
  - 饼图下钻：<5% 归并为"其他"扇区（灰色），可递归下钻至三级，带引导线标签 + 下方 2 列图例
  - 堆叠柱状图下钻：默认 L1 分色堆叠，点击图例→L2→L3 逐级下钻，← 返回按钮
  - 日期范围：自由选择 + 近一年/近一月/近一周快捷按钮
  - 图表全屏：⛶ 按钮 → 全屏铺满。柱状图全屏使用 layout="vertical"（水平条形图）适配手机横屏，自定义横向图例
  - 分类管理：树形展示 + 内联编辑/添加/删除，点击"管理分类"展开/折叠（方案 A）
  - 修改日期不清空页面，仅刷新数据（firstLoad ref 控制）
  - **依赖**：10.5.1.1
  - **难度**：★★★

- [x] **10.5.1.3 路由注册**
  - `main.tsx`：注册 `/expense/stats` 路由
  - Layout 嵌入 SmartFAB
  - **依赖**：10.5.1.2
  - **难度**：★

### Ticket 10.5.2: 智能 FAB

- [x] **10.5.2.1 SmartFAB 组件**
  - `components/SmartFAB.tsx`：路由感知，`routeActions` 映射表
  - 主页 → 跳转统计页（带路由过渡动画）
  - 统计页 → 返回主页
  - 可全屏任意位置拖拽（window.addEventListener 全局监听），位置持久化 localStorage
  - 火花星标 SVG 图标 + 对角渐变 + 玻璃态 + 呼吸光晕，z-index:110 覆盖 TopBar/BottomNav
  - **依赖**：10.5.1.3
  - **难度**：★★

- [x] **10.5.2.2 TopBar 返回按钮**
  - 子页面（统计页）自动显示"← 返回"按钮
  - 页面标题按路由精确匹配（"油耗统计" / "记账统计"）
  - **依赖**：10.5.1.3
  - **难度**：★

### Ticket 10.5.3: 油耗统计页重构

- [x] **10.5.3.1 日期筛选改造**
  - 移除年份选择器、截图分享按钮
  - 新增开始日期 ↔ 结束日期日期选择器 + 快捷按钮（近一年/近一月/近一周）
  - 点击快捷按钮 → 自动填充日期 → 自动查询
  - 手动改日期 → 两端都有值 → 自动查询
  - **依赖**：10.5.1.3
  - **难度**：★★

- [x] **10.5.3.2 智能粒度图表**
  - 后端新增 `GET /api/v1/stats/timeline?group_by=day|week|month`
  - 前端自动切换：≤14天→按天、≤90天→按周（7天一段）、>90天→按月
  - Y 轴标签水平排列（左油耗/右花费），增大图表宽度
  - 无数据日期填充 0 连续曲线，空数据点不画圆点
  - **依赖**：10.5.3.1
  - **难度**：★★★

- [x] **10.5.3.3 减震加载**
  - 首次加载显示 loading，后续筛选仅原地更新数字不重新渲染卡片
  - `firstLoad` ref 控制过渡动画
  - **依赖**：10.5.3.1
  - **难度**：★

### Ticket 10.5.4: 加油页面 UI 优化

- [x] **10.5.4.1 移除加油提醒**
  - 删除 `REMINDER_KEY` / `REMINDER_INTERVAL` 常量
  - 删除 `reminder` 状态 + `handleToggleReminder` + `requestNotificationPermission` + 定时器
  - **依赖**：10.5.1.1
  - **难度**：★

- [x] **10.5.4.2 筛选功能重排**
  - 筛选移到表单与记录列表之间
  - 筛选按钮右对齐，带汉堡图标
  - 筛选面板：2 列 grid 布局 + 滑入动画
  - 车辆栏：左侧选择框自适应 + 添加按钮完整显示
  - **依赖**：10.5.4.1
  - **难度**：★★

### Ticket 10.5.5: Bug 修复

- [x] **10.5.5.1 日期时区修正**
  - `fmtDate()` 从 `toISOString()`（UTC）改为 `getFullYear()`/`getMonth()`/`getDate()`（本地时间）
  - 修复东八区用户 8 月 1 日数据被算作 7 月 31 日的问题
  - **难度**：★★

- [x] **10.5.5.2 日期过滤边界修正**
  - `end_date` 过滤从 `<= date` 改为 `< date + 1 day`
  - 修复当天记录被截断的问题
  - **难度**：★

### Ticket 10.5.6: 跨路由数据保持

- [x] **10.5.6.1 FuelDataContext 状态提升**
  - 新建 `context/FuelDataContext.tsx`：通过 React Context 将共享状态提升到路由层级
  - 共享状态：`vehicles` / `selectedVehicleId` / `records` / `page` / `total` / `loading` / `error` / `filters`
  - Provider 自动加载车辆列表 + localStorage 恢复选中车辆
  - 车辆变化时自动加载对应记录
  - `useFuelData()` hook 供子组件消费
  - **依赖**：10.5.3.3
  - **难度**：★★

- [x] **10.5.6.2 路由嵌套：FuelDataLayout**
  - `main.tsx`：新增 `FuelDataLayout` 组件，`FuelDataProvider` 包裹 `/fuel` 和 `/fuel/stats` 两个路由
  - Context 在路由间不卸载 → 切换页面不重新请求数据
  - **依赖**：10.5.6.1
  - **难度**：★

- [x] **10.5.6.3 App.tsx 迁移**
  - 本地 `useState`（vehicles / selectedVehicleId / records / filters 等）替换为 `useFuelData()`
  - 移除 `fetchRecords` / `fetchVehicles` / `Vehicle` 等直接 import
  - 保留表单、编辑、升级等局部状态
  - **依赖**：10.5.6.1
  - **难度**：★★

- [x] **10.5.6.4 StatsPage.tsx 迁移**
  - 移除本地 `loadVehicles()` 函数和对应 `useEffect`
  - 移除 `VEHICLE_KEY` 常量
  - `vehicles` / `selectedVehicleId` 改用 `useFuelData()`
  - **依赖**：10.5.6.1
  - **难度**：★

### Ticket 10.5.7: 记账模块 Context 化

- [x] **10.5.7.1 ExpenseDataContext 状态提升**
  - 新建 `context/ExpenseDataContext.tsx`：通过 React Context 将记账共享状态提升到路由层级
  - 共享状态：`categories` / `expenses` / `total` / `page` / `loading`
  - Provider 自动加载分类树 + 支出列表
  - `useExpenseData()` hook 供子组件消费
  - **依赖**：10.5.6（FuelDataContext 模式参考）
  - **难度**：★★

- [x] **10.5.7.2 路由嵌套：ExpenseDataLayout**
  - `main.tsx`：新增 `ExpenseDataLayout` 组件，`ExpenseDataProvider` 包裹 `/expense` 和 `/expense/stats`
  - Context 在路由间不卸载 → 切换页面不重新请求分类数据
  - **依赖**：10.5.7.1
  - **难度**：★

- [x] **10.5.7.3 ExpensePage 迁移**
  - 本地 `categories` / `expenses` / `loading` 状态替换为 `useExpenseData()`
  - 移除 `fetchExpenses` / `fetchCategories` / `PAGE_SIZE` / `useCallback` 等本地逻辑
  - 保留表单、编辑、左滑删除等局部状态
  - **依赖**：10.5.7.1
  - **难度**：★★

- [x] **10.5.7.4 ExpenseStatsPage 迁移**
  - 本地 `categories` / `categoriesLoading` / `loadCategories` 替换为 `useExpenseData()`
  - 移除 `fetchCategories` import
  - **依赖**：10.5.7.1
  - **难度**：★

### Ticket 10.5.8: CategoryPicker 合并选择器

- [x] **10.5.8.1 CategoryPicker 组件**
  - 新建 `components/CategoryPicker.tsx`：合并三级分类选择器，替代原有三个独立 `<select>`
  - 功能一：搜索框与选择器合一，关闭状态显示已选路径，打开面板搜索实时过滤级联树
  - 功能二：Top 5 常用分类，面板顶部优先展示，完整三级路径，按提交次数排序
  - 功能三：上次选择记忆，`localStorage` key `expense_last_category`，打开时自动回填
  - 功能四：频次计数，提交成功 +1、删除 –1、编辑不改，最近 7 天懒清理，存 `expense_category_counts`
  - 功能五：每级末尾"+ 新建"，弹窗标题带完整父级路径（如"新建「餐饮 / 午餐」下的分类"）
  - 面板打开时渲染 `<div>` 避免移动端弹出键盘，二次点击切换为 `<input>` 可搜索
  - 面板打开时锁定 body 滚动（`overflow: hidden`）
  - **依赖**：10.5.7（useExpenseData 提供 categories）
  - **难度**：★★★

- [x] **10.5.8.2 CategoryPicker 样式**
  - 新建 `components/CategoryPicker.css`：触发器对齐车辆选择器（14px 圆角 + 12px 16px padding + 毛玻璃）
  - 右侧三角箭头 `▼`，打开时翻转 `▲`
  - focus 状态：accent 边框 + glow 光圈
  - 下拉面板：树形缩进 + hover 高亮 + 选中粗体 + "+ 新建"链接色
  - **依赖**：10.5.8.1
  - **难度**：★

- [x] **10.5.8.3 ExpensePage 接入 CategoryPicker**
  - 三个 `<select>` → 单个 `<CategoryPicker>`
  - 提交时调用 `updateFrequentCategories()` +1，删除时调用 –1
  - **依赖**：10.5.8.1
  - **难度**：★★

### Ticket 10.5.9: 记账 UI 细节优化

- [x] **10.5.9.1 日期/备注样式对齐**
  - 日期 `<input type="date">` 和备注 `<input type="text">` 统一毛玻璃样式（14px 圆角 + 12px 16px padding + blur + glow）
  - `flex: 1` 等宽平分 + `min-width: 0` 防溢出
  - **难度**：★

- [x] **10.5.9.2 记录列表三行堆叠布局**
  - 原单行多列 → 三行纵向布局：第一行分类（nowrap 完整展示）、第二行金额+编辑靠右、第三行日期+备注
  - `gap: 0` 紧凑排列，`min-height: 80px`
  - 金额 `flex-shrink: 0` 防挤压，`margin-left: 16px` 与左侧间距
  - **难度**：★★

- [x] **10.5.9.3 左滑删除完善**
  - 移除每条记录右侧的显式删除按钮，统一用左滑删除
  - `swipe-bg` 加 `onClick`，左滑露出红色"删除"后可点击删除
  - **难度**：★

### Ticket 10.5.10: 左滑删除动画优化

- [x] **10.5.10.1 删除按钮跟手滑出**
  - `swipe-bg` 从条件渲染改为始终在 DOM 中，`translateX: 100%` 初始隐藏
  - JS inline style 实时驱动按钮 `translateX = 80 + touchTranslateX`，与卡片完全同步
  - 松手回弹时 CSS transition 负责平滑过渡
  - `data-swiping` 属性驱动渐显，`cubic-bezier(0.22, 0.61, 0.36, 1)` 弹性曲线
  - 渐变红 `#e74c4c → #c0392b` + 弥散投影 + 高光线
  - **难度**：★★

---

## Phase 10.6 — "体验增强"（2026-08-01）

> **目标**：记账统计卡片 + 油耗累计下拉框 + 下拉刷新 + 页面骨架屏。

### Ticket 10.6.1: 记账六区间统计卡片

- [x] **10.6.1.1 后端 multi_summary 接口**
  - 新增 `GET /api/v1/expenses/multi_summary`（零参数，基于当天）
  - 一次返回 6 个区间累计金额：当年/当月/当周/近一年/近一月/近一周
  - `schema/expense_stats.py` 新增 `MultiSummaryResponse`（6 个 Decimal 字段）
  - `services/expense_stats_service.py` 新增 `get_multi_summary()`：`_sum_between()` 复用查询
  - 日期边界：当年=1月1日~今天、当月=本月1日~今天、当周=本周一~今天、近一年=12个月前~今天(不含起始日)、近一月=30天前~今天、近一周=7天前~今天
  - **依赖**：10.2.3
  - **难度**：★★

- [x] **10.6.1.2 前端统计卡片组件**
  - 新建 `ExpenseSummaryCards.tsx`：两行三列 grid，每个卡片两行一列（金额 + 标签）
  - 标签：当年/当月/当周/近一年/近一月/近一周
  - `ExpenseDataContext` 新增 `multiSummary` / `multiSummaryLoading` 状态
  - 页面进入 + 新增/删除后自动刷新
  - 无数据时显示 `¥0.00`
  - **依赖**：10.6.1.1, 10.5.7.1
  - **难度**：★★

### Ticket 10.6.2: 油耗页累计统计下拉框

- [x] **10.6.2.1 累计统计下拉框**
  - 筛选按钮左侧新增自定义下拉框，与车辆选择器同款毛玻璃样式
  - 三种选项：当年累计/当月累计/自上月今天累计（油耗+金额）
  - 后端复用 `GET /api/v1/stats/summary?start_date=&end_date=`
  - 三种模式同时取数（`fetchAllSummaries` 并行请求）
  - 选中后展示纯数字 `88.88L / 888.88¥`，展开选项有完整文字
  - `localStorage` key `fuel_summary_mode` 记忆选择
  - 新增/编辑/删除后自动刷新累计值
  - `flex: 1; min-width: 0` 自适应筛选按钮宽度变化
  - SVG 三角图标 + `z-index: 200` 防遮挡
  - **依赖**：10.5.4.2
  - **难度**：★★★

### Ticket 10.6.3: 下拉刷新

- [x] **10.6.3.1 PullToRefresh 通用组件**
  - 新建 `PullToRefresh.tsx`：实时查询 `window.scrollY` + `.layout-content` scrollTop，仅页面在顶部时触发
  - 方向阈值：垂直偏移 > 水平偏移 × 1.6，避免与左滑删除冲突
  - `dy < 5` 过滤微动，阻尼系数 0.4
  - pullDistance 使用 useRef 防止闭包陈旧值问题
  - 旋转 spinner 下拉指示器
  - 串行刷新：先记录后统计
  - **依赖**：无
  - **难度**：★★

- [x] **10.6.3.2 记账页集成**
  - `ExpensePage.tsx` 包裹 PullToRefresh
  - 下拉刷新：`refreshExpenses(1)` → `refreshMultiSummary()`
  - **依赖**：10.6.3.1, 10.5.7.3
  - **难度**：★

- [x] **10.6.3.3 油耗页集成**
  - `App.tsx` 包裹 PullToRefresh
  - 下拉刷新：`loadRecords(vehicleId, 1)` → `fetchAllSummaries(vehicleId)`
  - **依赖**：10.6.3.1, 10.5.6.3
  - **难度**：★

### Ticket 10.6.4: 页面骨架屏

- [x] **10.6.4.1 ExpensePageSkeleton**
  - 金额输入 → 分类选择器 → 日期/备注行 → 提交按钮 → 6 统计卡片 → 4 条记录
  - 布局与真实页面一致，`min-height: 100vh` 填满全屏
  - `sk-bar` 使用 `::after` 伪元素 gradient + `translateX` 动画闪动（跨浏览器兼容）
  - PullToRefresh 刷新时也切换到骨架屏
  - **依赖**：10.6.1.2
  - **难度**：★★

- [x] **10.6.4.2 FuelPageSkeleton**
  - 车辆选择器 → 录入表单 → 统计行+筛选按钮 → 4 条记录卡片
  - 布局与真实页面一致，`min-height: 100vh` 填满全屏
  - 骨架屏闪动动画与记账页复用同一机制
  - PullToRefresh 刷新时也切换到骨架屏
  - **依赖**：10.6.2.1
  - **难度**：★★

### Ticket 10.6.5: 底部导航 Tab 调换

- [x] **10.6.5.1 Tab 顺序调整**
  - `BottomNav.tsx`：记账 Tab 移到第一位，油耗第二位
  - 默认路由 `/` → `/expense`
  - **依赖**：10.4.1
  - **难度**：★

- [x] **10.6.5.2 DataProviders 合并**
  - `main.tsx`：`FuelDataLayout` + `ExpenseDataLayout` 合并为单一 `DataProviders`
  - 两个 Context 同时挂载并包裹所有主路由
  - Layout 始终存在 → Tab 切换不触发 useEffect 重新 fetch
  - **依赖**：10.5.6.2, 10.5.7.2
  - **难度**：★

---
## Phase 11 — "双数据库 + 设置中心"（2026-08-02）

> **目标**：App 内切换生产/测试数据库，统一设置弹窗（账户信息 + 版本检查 + 数据库切换）。

### Ticket 11.1: 后端 — 双数据库引擎

- [x] **11.1.1 database.py 双引擎架构**
  - 维护 `prod_engine` + `test_engine` 双 SQLAlchemy 引擎
  - `get_db()` 按请求头 `X-Database-Env: prod|test` 选择 Session
  - `init_db()` 同时对两个库执行 `Base.metadata.create_all()`
  - 本地 PostgreSQL 时忽略环境头，始终使用单一 PostgreSQL 引擎
  - **依赖**：1.1.5
  - **难度**：★★

- [x] **11.1.2 健康检查接口**
  - 新增 `GET /api/v1/health/db` — 按 `X-Database-Env` 头验证数据库连接
  - 返回 `{"status":"ok","env":"prod|test","database":"PostgreSQL"}`
  - 连接失败返回 503
  - **依赖**：11.1.1
  - **难度**：★

### Ticket 11.2: 前端 — 设置弹窗

- [x] **11.2.1 SettingsModal 组件**
  - `components/SettingsModal.tsx`：三个区域（账户/版本/数据库）
  - 账户：用户名前缀单字圆圈 + 用户名 + 数据库 tag，缓存优先 + 后台 `/me` 刷新，底部"退出登录"
  - 版本：版本号 + "检查更新"，始终走生产 Supabase
  - 数据库：正式库/测试库 radio，切换时先确认 → 调 `/health/db` 验证 → toast 三态反馈 → 清空 token 跳登录
  - **依赖**：11.1.2
  - **难度**：★★

- [x] **11.2.2 TopBar + LoginPage 入口**
  - TopBar 右侧增加 ⚙ 设置齿轮（font-size 18px，与主题按钮等大）
  - LoginPage 标题栏右侧增加 ⚙ 设置齿轮
  - TopBar 移除"退出登录"按钮
  - **依赖**：11.2.1
  - **难度**：★

- [x] **11.2.3 api.ts 数据库环境头**
  - 新增 `getDatabaseEnv()` / `setDatabaseEnv()` 函数
  - axios 拦截器自动添加 `X-Database-Env` 头
  - `localStorage` key `db_env` 持久化，默认 `prod`
  - **依赖**：11.1.1
  - **难度**：★

### Ticket 11.3: 记账统计页 UI 优化

- [x] **11.3.1 旭日图移除**
  - `ExpenseStatsPage.tsx`：删除 sunburst 相关代码（sunburstDrill / sunburstRings / mixColor / ChartType 'sunburst'）
  - 组件树仅保留 `'pie' | 'bar'` 两种图表类型
  - **依赖**：10.5.1.2
  - **难度**：★

- [x] **11.3.2 分类管理 tree 线段可视化**
  - 分类树使用 Unicode box-drawing 字符（`├──` `└──` `│`）展示层级
  - 每个节点下方添加分类按钮始终可见，CSS 虚线（`border-bottom: 1px dashed`）延伸至按钮
  - 按钮层级对齐：一级靠左/二级居中/三级靠右
  - 根级别不显示首个 `│` 竖线
  - 竖线间距 1 空格，空位 2 空格
  - **依赖**：10.5.1.2
  - **难度**：★★

- [x] **11.3.3 CategoryModal 统一弹框**
  - 新建 `components/CategoryModal.tsx`：支持 rename / addChild / addSibling 三种模式
  - 替换原有内联编辑和添加逻辑
  - 复用现有 rename 对话框的 CSS 样式
  - **依赖**：11.3.2
  - **难度**：★★

- [x] **11.3.4 SmartFAB 全屏交互优化**
  - z-index 从 110 提升到 10001，覆盖全屏图表遮罩层
  - 全屏模式下点击 FAB 仅关闭全屏（`window.dispatchEvent(new CustomEvent('close-chart-fullscreen'))`），不触发路由跳转
  - **依赖**：10.5.2.1
  - **难度**：★

- [x] **11.3.5 记账日分组无边框**
  - `ExpensePage.css`：`.expense-day-group` 移除 border/background/border-radius/box-shadow
  - 通过 28px margin-bottom + 日期标签自然区分
  - **依赖**：10.5.2
  - **难度**：★

---
## 依赖关系总图

```
Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4 ──→ Phase 5 ──→ Phase 6 ──→ Phase 7 ──→ Phase 8
  │                     （含在P1）
  │                        │
  └── Docker ──────────────┘
       │
       └── Render + Supabase 部署 ──→ Phase 4 需要线上 API ──→ Phase 7 CI/CD 需要 Render
                                                               │
                                                               └── Phase 10 依赖 Phase 4（JWT 鉴权）
                                                                     依赖 Phase 8（暗黑模式 CSS 变量）
                                                                     依赖 Phase 6（recharts 图表经验）
```

**Phase 1 是绝对基础**，建议按 Ticket 1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6 的顺序依次推进。

---

## 快速启动指南

当你准备好开始开发时，请输入：

```
@README.md @README.tickets.md 帮我实现 Ticket 1.1
```

我会逐行带你写代码，每完成一个 Ticket 标记为 `[x]`。

---

> **更新记录**
> - 2026-08-02: Phase 11 完成 — 双数据库 + 设置中心 + 记账统计页 UI 优化（双引擎架构 + SettingsModal + 旭日图移除 + 分类树 tree 线段 + CategoryModal 统一弹框 + SmartFAB 全屏交互 + 记账日分组无边框）共 8 个原子 Ticket
> - 2026-08-01: Phase 10.6 完成 — 体验增强（记账六区间统计卡片 + 油耗累计统计下拉框 + PullToRefresh 下拉刷新 + 页面骨架屏 + BottomNav Tab 调换 + DataProviders 合并 + 左滑删除动画优化）
> - 2026-08-01: Phase 10.5.7~10.5.9 完成 — 记账模块全面优化（ExpenseDataContext 跨路由数据保持 + CategoryPicker 合并三级选择器：搜索+Top5常用+上次记忆+频次计数+parent路径 + 日期/备注毛玻璃对齐 + 记录列表三行堆叠布局 + 左滑删除完善 + 移动端键盘控制）
> - 2026-08-01: Phase 10.5 完成 — 导航与统计重构（抽屉→全屏页 + SmartFAB 拖拽导航 + 统计日期筛选/智能粒度/减震加载 + 移除加油提醒 + 筛选重排 + UTC 时区修复 + FuelDataContext 跨路由数据保持）
> - 2026-07-31: Phase 10 新增 — 个人记账模块（Expense/ExpenseCategory 数据模型 + 分类 CRUD API + 统计聚合 ROLLUP + 底部双 Tab 导航重构 + CategoryPicker 三级级联 + recharts 三环旭日图/饼图下钻 + 左滑删除手势）共 19 个原子 Ticket
> - 2026-08-02: P10.6 体验优化 — 旭日图从 @nivo/sunburst 迁移为 recharts 三环 Pie 嵌套；柱状图新增图例下钻（L1→L2→L3）+ 全屏横屏布局（layout="vertical" 水平条形图）
> - 2026-07-30: Ticket 8.3 完成 — UI 美学升级
> - 2026-07-30: Phase 8 完成 — 锦上添花（暗黑模式 CSS 变量 + 数据库索引优化 + 前端分页加载更多 + UI 美学升级 + Python 3.9 兼容修复）
> - 2026-07-29: Phase 5 完成 — 多车管理（Vehicle 模型 + CRUD API + 前端车辆选择器/添加表单 + 油耗按车辆分组独立计算 + database 自动迁移 vehicle_id 列）
> - 2026-07-29: Phase 4 完成 — 用户鉴权（注册/登录 + JWT + 前端登录页 + 路由守卫 + 数据隔离 + 测试清单 test-specs/ + 自动化测试脚本 test_all.sh）
> - 2026-07-19：初版生成，基于 README.md 规格书拆解 8 个 Phase，共约 45 个原子 Ticket
