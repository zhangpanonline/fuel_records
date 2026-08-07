# Fuel Records — 性能优化规格书（前端降级 + 后端迁移 Fly.io）

> **关联文档**：[README.md](../README.md)（项目总规格书）、[EXPENSE_SPEC.md](./EXPENSE_SPEC.md)（记账模块规格）

---

## 1. 核心目标

解决当前 App 在手机端使用时**发烫**和**后端冷启动等待**两大体验问题，同时保留完整的视觉效果。

### 业务痛点
- **手机发烫**：Capacitor WebView 中 `backdrop-filter: blur()` 的毛玻璃效果 + 持续 `@keyframes` 无限动画导致 GPU 满负荷，长时间使用后手机明显发热
- **后端慢**：Render 免费层在 15 分钟无请求后休眠，每次打开 App 首次请求需要等待 5-15 秒容器唤醒
- **用户分层**：高性能手机用户享受完整视觉效果不会发热，老旧手机用户需要降级方案

### 设计原则
- 默认最优展示（所有视觉效果全开），与当前体验一致
- 在设置页面提供"性能模式"开关，用户主动开启后才降级
- 降级模式不影响任何功能逻辑，仅关闭部分 GPU 密集的视觉效果
- 后端迁移零业务代码改动，仅增加部署配置文件

---

## 2. 核心逻辑与用户交互

### 2.1 性能模式机制（类比暗黑模式）

沿用现有 `data-theme` 属性的模式，在 `<html>` 元素上添加 `data-performance` 属性：

```
data-performance="full"    → 默认，所有效果全开
data-performance="reduced" → 降级模式，关闭 GPU 密集型效果
```

**生命周期**：
1. 页面加载 → `main.tsx` 从 `localStorage` key `fuel_performance_mode` 读取 → 设置 `document.documentElement.dataset.performance`
2. 用户在设置弹窗切换开关 → 即时更新 `data-performance` 属性 + 写入 `localStorage`
3. CSS 通过 `[data-performance='reduced']` 选择器精确覆盖需要降级的样式
4. 不需要任何 JS 逻辑判断性能模式下的渲染行为——全部由 CSS 自动处理

### 2.2 SettingsModal 新增区域

在"数据库"分区下方新增"显示"分区：

```
┌─────────────────────────────┐
│  显示                        │
│  性能模式                     │
│  关闭毛玻璃和持续动画，减少发热  │
│  [======○] 关闭 / 开启       │  ← toggle 开关
└─────────────────────────────┘
```

- 开关样式：使用与数据库 radio 类似的视觉风格，toggle 圆角滑块
- 切换即时生效，无需刷新页面
- 默认 `full`（关闭状态 = 完整效果）

### 2.3 后端迁移交互

对用户完全透明——前端只需将 `VITE_API_BASE_URL` 从 Render URL 改为 Fly.io URL（`https://fuel-records.fly.dev`）。APK 重新构建后用户无感知切换。

---

## 3. 技术设计

### 3.1 前端改动清单

| 文件 | 操作 | 内容 |
|---|---|---|
| `frontend/src/index.css` | 追加 | `[data-performance='reduced']` 规则块（~40 行） |
| `frontend/src/main.tsx` | 追加 3 行 | 启动时读取 localStorage 并设置 `data-performance` |
| `frontend/src/components/SettingsModal.tsx` | 追加 | "显示"分区：性能模式 toggle 开关 |
| `frontend/src/components/SettingsModal.css` | 追加 | toggle 开关样式 |

**零文件删除，零现有代码修改**（降级 CSS 是追加的覆盖规则，不删不改原样式）。

#### 3.1.1 降级覆盖的 CSS 清单

**等级 1：关闭持续无限动画（6 处）**

| 文件 | 选择器 | 动画 | 降级行为 |
|---|---|---|---|
| `App.css:217` | `body` | `bgShift 20s infinite`（背景渐变游走） | `animation: none`，静态渐变 |
| `App.css:235` | `body::before` | `float 12s infinite`（装饰光斑） | `animation: none` |
| `App.css:249` | `body::after` | `float 10s infinite reverse`（装饰光斑） | `animation: none` |
| `App.css:1050` | `.submit-btn-expense` | `glowPulse 3s infinite`（提交按钮呼吸） | `animation: none`，hover 时显示光晕 |
| `SmartFAB.css:21` | `.smart-fab` | `fab-breathe 3s infinite`（FAB 呼吸） | `animation: none`，静态阴影 |
| `App.css:1050` | `.filter-dot` | `glowPulse 2s infinite`（筛选红点） | `animation: none` |

**等级 2：关闭 backdrop-filter blur（14 个选择器，7 个文件）**

| 文件 | 选择器 | blur 值 | 降级行为 |
|---|---|---|---|
| `App.css:589` | `.record-form, .records-section, .vehicle-form, .auth-form, .chart-container` | 20px | `backdrop-filter: none`，`background: var(--card-bg-solid)` |
| `App.css:889` | `.record-item` | 20px | 同上 |
| `App.css:954` | `.stats-card` | 20px | 同上 |
| `App.css:991` | `.fuel-summary-bar` | 20px | 同上 |
| `App.css:1462` | `.upgrade-overlay` | 6px | `backdrop-filter: none`，保留半透明遮罩 |
| `TopBar.css:13` | `.topbar` | 24px | `backdrop-filter: none`，`background: var(--card-bg-solid)` |
| `BottomNav.css:7` | `.bottom-nav` | 20px | 同上 |
| `SmartFAB.css:11` | `.smart-fab` | 16px | 同上（保留渐变背景） |
| `CategoryPicker.css:19` | `.category-picker-trigger` | 20px | `backdrop-filter: none`，`background: var(--card-bg-solid)` |
| `CategoryPicker.css:63` | `.category-picker-dropdown` | 20px | 同上 |
| `ExpensePage.css:80` | `.date-input` | 20px | 同上 |
| `ExpensePage.css:96` | `.note-input` | 20px | 同上 |
| `ExpensePage.css:384` | `.quick-create-overlay` | 4px | `backdrop-filter: none` |
| `StatsPage.css:18` | `.stats-page` | 20px | `backdrop-filter: none`，`background: var(--card-bg-solid)` |

**不降级（保留不动）**：
- 一次性入场动画（`fadeInUp`、`scaleIn`、`slideDown`、`settingsFadeIn` 等）——播完即止
- 骨架屏 shimmer 动画（`skShimmer`、`fskShimmer`）——仅在页面加载几秒钟
- 下拉刷新 spinner（`pullSpin`）——仅在用户下拉时短暂触发
- hover/click 过渡动画（`transition`）——非持续动画，不影响发热

#### 3.1.2 状态管理

```typescript
// main.tsx 启动时
const perfMode = localStorage.getItem('fuel_performance_mode') || 'full';
document.documentElement.dataset.performance = perfMode;

// SettingsModal.tsx
const [perfMode, setPerfMode] = useState<'full' | 'reduced'>(
  () => (localStorage.getItem('fuel_performance_mode') as 'full' | 'reduced') || 'full'
);

function handleTogglePerf() {
  const next = perfMode === 'full' ? 'reduced' : 'full';
  setPerfMode(next);
  localStorage.setItem('fuel_performance_mode', next);
  document.documentElement.dataset.performance = next;
}
```

### 3.2 前端改动 — 服务器切换（运行时切换 Render ↔ Fly.io）

在 SettingsModal 中新增"服务器"分区，允许用户运行时切换后端服务器。与数据库切换类似：先验证目标服务器可用，再切换。**无需重新登录**（两个服务器共用同一 JWT_SECRET + 同一 Supabase，token 互通）。

#### 3.2.1 api.ts 改造

核心变更：`axios` 的 `baseURL` 从构建时常量 → 运行时从 `localStorage` 动态读取。

**改动前**：
```typescript
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',  // 构建时写死
  timeout: 60000,
})
```

**改动后**：
```typescript
// 服务器配置
const SERVERS: Record<string, string> = {
  render: 'https://fuel-records.onrender.com',
  flyio: 'https://fuel-records.fly.dev',
}
const DEFAULT_SERVER = 'render'
const SERVER_KEY = 'fuel_api_server'

export function getApiServer(): string {
  return localStorage.getItem(SERVER_KEY) || DEFAULT_SERVER
}

export function setApiServer(server: string) {
  localStorage.setItem(SERVER_KEY, server)
}

export function getApiBaseUrl(): string {
  return SERVERS[getApiServer()] || SERVERS[DEFAULT_SERVER]
}

const apiClient = axios.create({ timeout: 60000 })

// 请求拦截器：动态 baseURL + X-Database-Env + Authorization
apiClient.interceptors.request.use((config) => {
  config.baseURL = getApiBaseUrl()           // 每次请求动态读取
  config.headers['X-Database-Env'] = getDatabaseEnv()
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})
```

#### 3.2.2 SettingsModal 新增"服务器"分区

在"数据库"分区上方新增：

```
┌─────────────────────────────┐
│  服务器                       │
│  切换后端服务，无需重新登录      │
│  ○  Render（当前）            │  ← radio，与数据库切换同款样式
│  ○  Fly.io                   │
│  [验证中…]                    │  ← 切换时显示
│  [已切换至 Fly.io]            │  ← 成功 toast
│  [Fly.io 不可用，请稍后重试]    │  ← 失败 toast
└─────────────────────────────┘
```

**交互流程**：
1. 用户点击目标服务器 → 调 `GET {目标URL}/api/v1/health`（timeout 8s，axios 单独发请求不走 apiClient）
2. 成功 → `setApiServer()` 写入 localStorage + 即时生效（下一次 apiClient 请求自动使用新 URL）
3. 失败 → toast 报错，不切换
4. 与数据库切换并行（服务器 × 数据库 = 4 种组合）

#### 3.2.3 改动文件清单

| 文件 | 操作 | 内容 |
|---|---|---|
| `frontend/src/services/api.ts` | 修改 | axios baseURL 动态化 + `getApiServer`/`setApiServer`/`getApiBaseUrl` |
| `frontend/src/components/SettingsModal.tsx` | 追加 | "服务器"分区：Render / Fly.io radio 切换 + 健康检查 + toast |
| `frontend/src/components/SettingsModal.css` | 追加 | 服务器 radio 复用 `.settings-env-option` 样式（已有） |

### 3.3 后端改动清单（Fly.io 迁移）

| 文件 | 操作 | 内容 |
|---|---|---|
| `backend/Dockerfile` | 修改 1 行 | CMD 改为读取 `$PORT` 环境变量 |
| `backend/fly.toml` | 新建 | Fly.io 部署配置（约 20 行） |
| `frontend/.env.production` | 修改 1 行 | `VITE_API_BASE_URL` 指向 Fly.io |

**不需要改动**：
- Supabase 数据库（外部服务，连接串不变）
- 所有 FastAPI 业务代码（路由、服务、模型）
- Alembic 迁移（启动时自动执行）
- 双数据库引擎（正式库 + 测试库，继续工作）

#### 3.2.1 Dockerfile 改动

```dockerfile
# 改前
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

# 改后
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
```

Fly.io 通过 `$PORT` 环境变量分配动态端口（通常是 8080）。`${PORT:-8000}` 确保本地不加 `PORT` 环境变量时回退到 8000，本地开发不受影响。

#### 3.2.2 fly.toml 配置

```toml
app = "fuel-records"
primary_region = "nrt"

[build]
  dockerfile = "Dockerfile"

[[services]]
  protocol = "tcp"
  internal_port = 8080
  ports = [{ port = 80, handlers = ["http"] }, { port = 443, handlers = ["tls", "http"] }]

  [[services.tcp_checks]]
    interval = "15s"
    timeout = "5s"
    grace_period = "30s"
```

- 东京节点（`nrt`）：对国内访问最优
- `grace_period = 30s`：给首次启动的 Alembic 迁移足够时间，防止健康检查误判 502
- Fly.io 自动签发 SSL 证书，HTTPS 开箱即用

#### 3.2.3 部署命令

```bash
# 1. 本地安装 CLI（一次性）
brew install flyctl
flyctl auth signup

# 2. 在 backend/ 目录执行
cd backend
fly launch          # 自动检测 Dockerfile
fly secrets set \
  DB_TYPE=postgresql \
  DB_PG_URL="postgresql://postgres:xxx@xxx.supabase.co:6543/postgres" \
  JWT_SECRET="your-secret" \
  APP_DEBUG=false
fly deploy

# 3. 前端改 .env.production
VITE_API_BASE_URL=https://fuel-records.fly.dev
```

---

## 4. 边界条件与异常处理

### 4.1 性能模式

| 场景 | 处理方式 |
|---|---|
| 用户首次使用（localStorage 为空） | 默认 `full`，展示完整效果 |
| 用户在降级模式下操作 | 功能逻辑完全不受影响，仅视觉降级 |
| 切换性能模式 | 即时生效，无需刷新页面 |
| 旧版本 App 访问新设置 | 无 `data-performance` 属性 → 默认完整效果，向后兼容 |
| 切换后清除 localStorage | 应用启动时检查，不存在则回退 `full` |

### 4.2 服务器切换

| 场景 | 处理方式 |
|---|---|
| 目标服务器不可达（网络超时 8s） | toast "xxx 不可用，请稍后重试"，不切换 |
| 目标服务器 health 返回非 200 | toast 报错，不切换 |
| 用户快速多次点击切换 | 切换中 disabled 所有 radio 选项 |
| localStorage 被清空 | `getApiServer()` 回退 `'render'`（默认服务器） |
| 未知 server key | `getApiBaseUrl()` 回退 Render URL |
| 服务器 URL 变更后旧 APK 兼容 | `SERVERS` 内置备用 URL，同时设 `VITE_API_BASE_URL` 兜底 |

### 4.3 Fly.io 部署

| 场景 | 处理方式 |
|---|---|
| 首次部署 502 | `grace_period: 30s` 给 Alembic 迁移时间，超过后自动重试 |
| 256MB 内存不够 | `fly.toml` 可追加 `vm.size = "shared-cpu-1x"` 升级到 512MB |
| 国内访问慢 | 当前选东京节点，可切换 `sin`（新加坡）、`hkg`（香港） |
| 环境变量缺失 | 启动时报错，日志可查，`fly logs` 排查 |
| 前端 API 地址错误 | APK 构建前检查 `VITE_API_BASE_URL`，登录页有网络错误提示 |
| Render 旧部署并存 | Render 服务保持运行，逐步切换用户到新 APK，观察无问题后再下线 Render |

---

> **本规格书基于 `/improve-codebase-architecture` 架构审计产出，结合 CSS 全量扫描（15 个 CSS 文件、18 个 TSX 组件）形成，改动精确到行。**
>
> **状态**：待实施。实施顺序建议：1. 前端 CSS 降级（性能模式开关）→ 2. 服务器切换功能 + api.ts 动态 baseURL 改造 → 3. 构建 APK 验证 → 4. 后端迁移 Fly.io（20 分钟 CLI）。
