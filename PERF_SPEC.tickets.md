# Fuel Records 性能优化 — 任务拆解清单

> 基于 [PERF_SPEC.md](file:///Users/zp/Code/fuel_records/PERF_SPEC.md) 规格书拆解。

---

## 图例

- `[ ]` — 待办
- `[x]` — 已完成
- **依赖**：标注该任务的前置任务编号

---

## 实施顺序

```
Ticket 1（CSS 降级规则）
  → Ticket 2（main.tsx 启动读取）
    → Ticket 3（SettingsModal 性能模式开关）
      → Ticket 4（api.ts baseURL 动态化）
        → Ticket 5（SettingsModal 服务器切换）
          → Ticket 6（后端 Dockerfile + fly.toml）
            → Ticket 7（Fly.io 部署 + 前端 API 地址切换）
```

---

### Ticket 1: 前端 — CSS 降级规则块

- [x] **1.1 追加 `[data-performance='reduced']` 规则块到 index.css**
  - 等级 1：关闭 6 处持续无限动画（`body` `bgShift`、`body::before/::after` `float`、`.submit-btn-expense` `glowPulse`、`.smart-fab` `fab-breathe`、`.filter-dot` `glowPulse`）
  - 等级 2：关闭 14 个选择器的 `backdrop-filter: blur()`，改为 `none` + 纯色背景
  - 不降级：一次性入场动画、骨架屏 shimmer、下拉刷新 spinner
  - **依赖**：无
  - **难度**：★

### Ticket 2: 前端 — main.tsx 启动时读取性能模式

- [x] **2.1 在 main.tsx 中追加 `data-performance` 初始化**
  - 在 `createRoot()` 之前读取 `localStorage` key `fuel_performance_mode`
  - 设置 `document.documentElement.dataset.performance`
  - 默认 `'full'`
  - **依赖**：1.1
  - **难度**：★

### Ticket 3: 前端 — SettingsModal 性能模式开关

- [x] **3.1 在 SettingsModal 中新增"显示"分区**
  - 位置：数据库分区下方
  - toggle 开关：关闭（默认，完整效果）/ 开启（降级模式）
  - 标签："性能模式"，描述："关闭毛玻璃和持续动画，减少手机发热"
  - 切换即时生效：`localStorage.setItem` + `document.documentElement.dataset.performance`
  - **依赖**：2.1
  - **难度**：★★

- [x] **3.2 toggle 开关样式（SettingsModal.css）**
  - 复用 `.settings-env-option` 视觉风格，toggle 圆角滑块
  - **依赖**：3.1
  - **难度**：★

### Ticket 4: 前端 — api.ts baseURL 动态化

- [x] **4.1 改造 api.ts**
  - 新增 `SERVERS` 常量映射（render / flyio → URL）
  - 新增 `getApiServer()` / `setApiServer()` / `getApiBaseUrl()` 三个函数
  - 默认服务器 `'render'`，localStorage key `fuel_api_server`
  - `apiClient` 去掉 `baseURL` 构建时参数，改为请求拦截器 `config.baseURL = getApiBaseUrl()`
  - `exportCSV()` 中的 `import.meta.env.VITE_API_BASE_URL` 替换为 `getApiBaseUrl()`
  - **依赖**：无
  - **难度**：★★

### Ticket 5: 前端 — SettingsModal 服务器切换

- [x] **5.1 在 SettingsModal 中新增"服务器"分区**
  - 位置：数据库分区上方
  - 两个 radio 选项：Render / Fly.io
  - 当前选中的服务器高亮（与数据库 radio 同款样式）
  - 切换前调 `GET {目标URL}/api/v1/health` 验证（timeout 8s，axios 单独请求不走 apiClient）
  - 成功 → `setApiServer()` → toast "已切换至 xxx"
  - 失败 → toast "xxx 不可用，请稍后重试"，不切换
  - 切换中所有 radio disabled
  - **依赖**：4.1
  - **难度**：★★

### Ticket 6: 后端 — Dockerfile + fly.toml

- [x] **6.1 修改 Dockerfile 启动命令**
  - CMD 从硬编码 `--port 8000` 改为 `sh -c "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"`
  - **依赖**：无
  - **难度**：★

- [x] **6.2 新建 backend/fly.toml**
  - `app = "fuel-records"`，`primary_region = "nrt"`（东京）
  - `internal_port = 8080`，HTTP(80) + HTTPS(443)
  - TCP 健康检查：interval 15s，timeout 5s，grace_period 30s
  - **依赖**：6.1
  - **难度**：★

### Ticket 7: Fly.io 部署 + 前端切换

- [ ] **7.1 本地部署 Fly.io**
  - `cd backend && fly launch`（AI 执行，加 `--name fuel-records --region nrt` 跳过交互）
  - `fly secrets set`（用户手动执行，从 `fly_secrets.txt` 读取）
  - `fly deploy`（AI 执行）
  - **依赖**：6.2
  - **难度**：★

- [ ] **7.2 前端环境变量切换**
  - `frontend/.env.production` 中 `VITE_API_BASE_URL` 指向 Fly.io（`https://fuel-records.fly.dev`）
  - 作为兜底：服务器切换功能始终可用，用户可切回 Render
  - **依赖**：7.1
  - **难度**：★

- [x] **7.3 构建 APK 验证**
  - `npm run build:apk`，安装到手机验证
  - 登录 → 记账 → 切换服务器 → 验证数据一致
  - **依赖**：5.1, 7.1
  - **难度**：★

---

> **更新记录**
> - 2026-08-02：初版，基于 PERF_SPEC.md 拆解 7 个 Ticket、11 个子任务。
