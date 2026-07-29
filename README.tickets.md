# Fuel Records — 任务拆解清单

> 基于 [README.md](file:///Users/zp/Code/fuel_records/README.md) 规格书的 8 期迭代计划，拆解为原子任务。

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
7. **更新 DIR.md**：每个子章节完成后，我会同步更新 [`DIR.md`](file:///Users/zp/Code/fuel_records/DIR.md)，将本次新增或修改的目录/文件信息写进去，方便你日后回顾整个项目结构

> **核心原则**：不走"先抄后理解"的路，而是每一步都理解透了再走下一步。哪怕一个 Ticket 花几个小时，也要确保你是真懂了，而不是"跑通了但不知道为什么"。

## Phase 1 — "Hello 油耗"（最小可用版）

> **目标**：单人单车辆，手机上能真实录入加油记录、看到油耗。

### Ticket 1.1: 项目骨架搭建 — FastAPI 后端

- [x] **1.1.1 初始化项目目录结构**
  - 创建 `backend/` 目录及所有子目录（`models/`, `schemas/`, `routers/`, `services/`, `core/`）
  - 创建 `__init__.py` 使各目录为 Python 包
  - 创建 `requirements.txt`（fastapi, uvicorn, sqlalchemy, pymysql, pydantic, python-dotenv, loguru）
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

- [x] **1.3.1 本地启动 MySQL**
  - 检查本地是否已安装 MySQL，如未安装用 `brew install mysql`
  - 创建数据库 `fuel_records`（字符集 `utf8mb4`）
  - 创建数据库用户（可选）
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
  - 定义两个 service：`app`（FastAPI）+ `db`（MySQL 8.0）
  - `db`：挂载 volume 持久化数据，配置环境变量（MYSQL_ROOT_PASSWORD, MYSQL_DATABASE）
  - `app`：映射端口 8000:8000，依赖 db，读取 `.env`
  - **依赖**：1.4.1
  - **难度**：★★

- [x] **1.4.3 本地 Docker 验证**
  - `docker-compose up -d` 启动
  - 验证 MySQL 和 FastAPI 均正常运行
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
  - 踩坑记录及修复：Gradle 下载超时、JDK 24 不兼容、Kotlin stdlib 冲突 → 见 `apk-build-guide.md`
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

- [ ] **2.2.1 记录列表支持删除**
  - 每条记录加"删除"按钮（小红色图标）
  - 点击后弹出 `window.confirm` 确认对话框
  - 确认后调用 `DELETE /api/v1/records/{id}`
  - 删除成功后刷新列表
  - **依赖**：1.6.3, 2.1.2
  - **难度**：★★

- [ ] **2.2.2 记录编辑功能**
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

- [ ] **3.1 部署运维巩固**
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

- [ ] **4.1.1 创建 User ORM 模型**
  - `models/user.py`：id, username(unique), email(unique), hashed_password, is_active, created_at, updated_at
  - 新增 `fuel_records.user_id` 字段（ALTER TABLE）
  - 建立 User ↔ FuelRecord 一对多关系
  - **依赖**：1.1.5
  - **难度**：★★

- [ ] **4.1.2 密码哈希工具**
  - `core/security.py`：
    - 集成 `passlib` 或 `bcrypt` 实现 `hash_password()` 和 `verify_password()`
  - **依赖**：4.1.1
  - **难度**：★

- [ ] **4.1.3 JWT 工具函数**
  - `generate_access_token(user_id, expires_delta)` → 返回 JWT 字符串
  - `verify_access_token(token)` → 返回 user_id 或抛出异常
  - 配置 JWT_SECRET 和 JWT_ALGORITHM 到 `.env`
  - 支持 refresh_token 机制（简单版，access_token 过期时间 24h）
  - **依赖**：4.1.1
  - **难度**：★★

- [ ] **4.1.4 注册与登录路由**
  - `POST /api/v1/auth/register`：用户名+密码 → 创建用户 → 返回 JWT
  - `POST /api/v1/auth/login`：用户名+密码 → 验证 → 返回 JWT
  - 用户名唯一性校验、长度限制
  - 密码强度校验（至少 6 位）
  - **依赖**：4.1.2, 4.1.3
  - **难度**：★★

- [ ] **4.1.5 JWT 依赖注入中间件**
  - `core/deps.py`：
    - `get_current_user` 依赖：从 Authorization header 提取 Bearer token → 验证 → 返回当前用户
  - 应用到所有 `/api/v1/records` 路由
  - **依赖**：4.1.3, 4.1.4
  - **难度**：★★

### Ticket 4.2: 后端 — 数据隔离

- [ ] **4.2.1 加油记录关联用户**
  - 所有 record 操作自动填充 `user_id`（从当前 token 获取）
  - 查询时按 `user_id` 过滤，用户只能看到自己的记录
  - 修改/删除时校验 `user_id`
  - **依赖**：4.1.5, 1.2.3
  - **难度**：★★

### Ticket 4.3: React 前端 — 登录页面

- [ ] **4.3.1 登录/注册页面**
  - 两个 Tab 切换：登录 / 注册
  - 登录：用户名输入框 + 密码输入框 + 登录按钮
  - 注册：用户名输入框 + 密码输入框 + 确认密码输入框 + 注册按钮
  - 表单校验（非空、密码一致、长度限制）
  - 调用 `POST /api/v1/auth/login` 或 `POST /api/v1/auth/register`
  - **依赖**：4.1.4
  - **难度**：★★

- [ ] **4.3.2 Token 持久化**
  - 登录成功后保存 JWT 到 `localStorage`
  - 封装 `apiClient`（axios 实例），自动在 header 添加 `Authorization: Bearer <token>`
  - Token 过期检测 → 清除 localStorage → 强制跳转登录页
  - **依赖**：4.3.1
  - **难度**：★★

- [ ] **4.3.3 路由守卫**
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

- [ ] **5.1.1 创建 Vehicle ORM 模型**
  - `models/vehicle.py`：id, user_id(FK), name, plate(可选), initial_mileage, is_active, created_at
  - 关联 User（多对一）
  - 关联 FuelRecord（一对多）
  - 迁移：fuel_records 表新增 vehicle_id 字段
  - **依赖**：4.1.1
  - **难度**：★★

- [ ] **5.1.2 车辆 CRUD 路由**
  - `POST /api/v1/vehicles` — 创建车辆（需指定初始里程）
  - `GET /api/v1/vehicles` — 当前用户的车辆列表
  - `PUT /api/v1/vehicles/{id}` — 修改车辆信息
  - `DELETE /api/v1/vehicles/{id}` — 删除车辆（校验有无关联记录）
  - **依赖**：5.1.1
  - **难度**：★★

- [ ] **5.1.3 加油记录关联车辆**
  - 创建记录时需指定 vehicle_id
  - 查询时默认展示最近使用的车辆
  - 油耗计算按 vehicle_id 分组独立计算
  - **依赖**：5.1.1, 1.2.3
  - **难度**：★★

### Ticket 5.2: React 前端 — 多车管理 UI

- [ ] **5.2.1 车辆列表页**
  - 首页展示用户的所有车辆（卡片形式）
  - 显示每辆车的名称、总里程、平均油耗摘要
  - 点击进入该车辆的加油记录页
  - **依赖**：5.1.2
  - **难度**：★★

- [ ] **5.2.2 添加/编辑车辆页面**
  - 表单：名称、车牌号（可选）、初始里程
  - 创建后跳转到该车记录页
  - **依赖**：5.2.1
  - **难度**：★★

- [ ] **5.2.3 车辆切换与默认车辆**
  - 记录页顶部 `select` 下拉框切换车辆
  - 默认选中最近使用的车辆（存 localStorage）
  - 创建记录时自动绑定当前选中的车辆
  - **依赖**：5.2.1, 4.3.3
  - **难度**：★

---

## Phase 6 — "数据之美"

> **目标**：统计汇总数据，可视化呈现。

### Ticket 6.1: 后端 — 统计 API

- [ ] **6.1.1 汇总统计接口**
  - `GET /api/v1/stats/summary?vehicle_id=X`
  - 返回：总里程（最后一笔 - 第一笔）、总加油量、总金额、平均油耗、平均单价
  - SQLAlchemy 聚合查询（`func.sum`, `func.avg`, `func.count`）
  - **依赖**：5.1.1
  - **难度**：★★

- [ ] **6.1.2 月度统计接口**
  - `GET /api/v1/stats/monthly?vehicle_id=X&year=2026`
  - 返回：每月加油次数、总油量、总金额、平均油耗
  - SQLAlchemy `DATE_FORMAT` + `GROUP BY` 分组
  - **依赖**：6.1.1
  - **难度**：★★

### Ticket 6.2: React 前端 — 统计页面

- [ ] **6.2.1 概览统计卡片页**
  - 展示：总里程、平均油耗、总花费、总加油量
  - 大号数字 + 标签，CSS 卡片布局美观排版
  - **依赖**：6.1.1
  - **难度**：★★

- [ ] **6.2.2 月度折线图**
  - 集成 Recharts 或 ECharts 库
  - X 轴：月份，Y 轴：油耗
  - 展示月度油耗变化趋势
  - **依赖**：6.1.2, 6.2.1
  - **难度**：★★

- [ ] **6.2.3 历史记录搜索与筛选**
  - 按日期范围筛选（两个 date input）
  - 按是否加满筛选（checkbox）
  - 搜索备注文字（如按加油站名搜索）
  - **依赖**：1.2.4
  - **难度**：★★

---

## Phase 7 — "生产级"

> **目标**：代码质量、自动化、可靠性保障。

### Ticket 7.1: 数据库迁移（Alembic）

- [ ] **7.1.1 集成 Alembic**
  - `alembic init alembic`
  - 配置 `alembic.ini` 连接数据库
  - 编写 `env.py`（自动检测 models 变更）
  - 生成初始迁移脚本
  - 掌握：`alembic revision --autogenerate` + `alembic upgrade head`
  - **依赖**：1.1.5
  - **难度**：★★

### Ticket 7.2: 单元测试

- [ ] **7.2.1 测试基础设施**
  - 集成 pytest
  - 使用 `TestClient`（FastAPI 自带）模拟 HTTP 请求
  - 使用 SQLite 内存数据库做测试隔离
  - 创建 `conftest.py` 定义 fixture
  - **依赖**：1.1.2
  - **难度**：★★

- [ ] **7.2.2 核心业务逻辑测试**
  - 测试油耗计算：基线记录、正常计算、非加满跳过
  - 测试级联重算：修改/删除中间记录后油耗是否正确
  - 测试里程校验：新里程不能小于上次里程
  - **依赖**：7.2.1, 1.2.3
  - **难度**：★★

- [ ] **7.2.3 API 接口测试**
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

### Ticket 8.1: 数据导出

- [ ] **8.1.1 CSV 导出 API**
  - `GET /api/v1/records/export/csv?vehicle_id=X`
  - 返回 CSV 文件流（`StreamingResponse` + CSV 头）
  - **依赖**：5.1.1
  - **难度**：★★

- [ ] **8.1.2 前端下载/分享功能**
  - 点击"导出" → 浏览器下载 CSV 文件
  - 使用 `navigator.share` API（Android 支持）分享
  - 回退方案：复制下载链接
  - **依赖**：8.1.1
  - **难度**：★★

### Ticket 8.2: 体验增强

- [ ] **8.2.1 暗黑模式**
  - React 端使用 CSS 变量 + `prefers-color-scheme` 媒体查询
  - 或实现手动切换按钮（存 localStorage 记住偏好）
  - **依赖**：1.6.3
  - **难度**：★

- [ ] **8.2.2 加油提醒推送**
  - 使用浏览器 Notification API 或 Capacitor 本地通知插件
  - 设置提醒周期（如每周）
  - **依赖**：1.6.4
  - **难度**：★★

- [ ] **8.2.3 记录分享截图**
  - 使用 `html2canvas` 库截图统计页面
  - 支持保存为图片或分享
  - **依赖**：8.2.1
  - **难度**：★★

### Ticket 8.3: 性能优化

- [ ] **8.3.1 数据库索引优化**
  - 分析慢查询（MySQL slow query log）
  - 添加必要索引
  - **依赖**：1.1.5
  - **难度**：★★

- [ ] **8.3.2 前端列表性能**
  - 大量记录时使用虚拟滚动（react-window 或 IntersectionObserver 分页加载）
  - **依赖**：1.6.3
  - **难度**：★★

---

## 依赖关系总图

```
Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4 ──→ Phase 5 ──→ Phase 6 ──→ Phase 7 ──→ Phase 8
  │                     （含在P1）
  │                        │
  └── Docker ──────────────┘
       │
       └── Render + Supabase 部署 ──→ Phase 4 需要线上 API ──→ Phase 7 CI/CD 需要 Render
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
> - 2026-07-19：初版生成，基于 README.md 规格书拆解 8 个 Phase，共约 45 个原子 Ticket
