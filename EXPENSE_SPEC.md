# Expense Tracker — 个人记账功能规格书

> 在 Fuel Records 油耗记录 App 中集成个人记账模块。用户数据共享（同一 User 模型 + JWT 鉴权），记账数据完全隔离。

---

## 1. 核心目标

为 Fuel Records App 增加一个独立的个人记账功能，解决"我的钱花在哪了"的日常追踪需求。与油耗记录平行存在，共用登录体系但数据互不关联。

### 学习目标
- **树形数据模型**：自引用分类表（parent_id），掌握递归查询与扁平化技巧
- **多维度聚合查询**：SQLAlchemy GROUP BY + 时间维度（年/月/周/自定义）
- **D3-based 可视化**：`recharts` 堆叠柱状图（支持下钻）+ 饼图下钻
- **React 底部导航重构**：从单路由升级为底部 Tab 导航架构

---

## 2. 数据模型

### 2.1 expense_categories（分类表 — 用户自定义）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INT | PK, AUTO_INCREMENT | 分类ID |
| user_id | INT | FK → users.id, NOT NULL | 所属用户 |
| parent_id | INT | FK → expense_categories.id, NULLABLE | 父分类ID，NULL 表示一级分类 |
| name | VARCHAR(50) | NOT NULL | 分类名称 |
| level | TINYINT | NOT NULL | 层级：1 / 2 / 3 |
| sort_order | INT | DEFAULT 0 | 排序权重，越小越靠前 |
| created_at | DATETIME | DEFAULT NOW | 创建时间 |
| updated_at | DATETIME | ON UPDATE NOW | 修改时间 |

- 固定 3 层深度，不做无限嵌套
- 树形自引用结构（parent_id），查询时可递归也可扁平化
- 每个用户有独立的分类体系

### 2.2 expenses（支出记录表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INT | PK, AUTO_INCREMENT | 记录ID |
| user_id | INT | FK → users.id, NOT NULL | 所属用户 |
| amount | DECIMAL(10,2) | NOT NULL | 金额（元），> 0 |
| category_l1 | VARCHAR(50) | NOT NULL | 一级分类名称（冗余，加速查询） |
| category_l2 | VARCHAR(50) | NOT NULL | 二级分类名称 |
| category_l3 | VARCHAR(50) | NOT NULL | 三级分类名称 |
| note | TEXT | NULLABLE | 备注 |
| expense_date | DATE | NOT NULL | 支出日期 |
| created_at | DATETIME | DEFAULT NOW | 创建时间 |
| updated_at | DATETIME | ON UPDATE NOW | 修改时间 |

- 分类名称冗余存储在记录中（查询时无需 JOIN categories 表）
- 分类重命名**不会**自动更新历史记录中的分类名，历史记录保留创建时的名称快照
- 无支付方式字段

### 2.3 索引设计

| 表 | 索引字段 | 目的 |
|---|---|---|
| expenses | (user_id, expense_date) | 按用户 + 时间范围查询 |
| expenses | (user_id, category_l1, expense_date) | 按一级分类 + 时间聚合 |
| expenses | (user_id, category_l1, category_l2, expense_date) | 按二级分类 + 时间聚合 |
| expense_categories | (user_id, parent_id) | 查询用户的分类树 |

---

## 3. API 设计

所有接口均需 JWT 鉴权，前缀 `/api/v1/expenses`。

### 3.1 支出记录 CRUD

```
POST   /api/v1/expenses           创建支出记录
GET    /api/v1/expenses           分页查询记录列表
PUT    /api/v1/expenses/{id}      修改记录
DELETE /api/v1/expenses/{id}      删除记录
```

**POST /api/v1/expenses 请求体**：

```json
{
  "amount": 35.5,
  "category_l1": "餐饮",
  "category_l2": "午餐",
  "category_l3": "外卖",
  "note": "美团 — 黄焖鸡米饭",
  "expense_date": "2026-07-31"
}
```

> HTTP 201，返回创建后的完整记录（字段同 GET /expenses 单条记录）。

**GET /api/v1/expenses 查询参数**：

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| page | int | 1 | 页码 |
| page_size | int | 20 | 每页条数 |
| start_date | str | 可选 | 开始日期 |
| end_date | str | 可选 | 结束日期 |
| category_l1 | str | 可选 | 一级分类筛选 |
| category_l2 | str | 可选 | 二级分类筛选 |
| category_l3 | str | 可选 | 三级分类筛选 |

**GET /api/v1/expenses 响应**：

```json
{
  "items": [
    {
      "id": 1,
      "amount": 35.5,
      "category_l1": "餐饮",
      "category_l2": "午餐",
      "category_l3": "外卖",
      "note": "美团 — 黄焖鸡米饭",
      "expense_date": "2026-07-31",
      "created_at": "2026-07-31T12:30:00",
      "updated_at": "2026-07-31T12:30:00"
    }
  ],
  "total": 85,
  "page": 1,
  "page_size": 20
}
```

**PUT /api/v1/expenses/{id} 请求体**（所有字段可选）：

```json
{
  "amount": 42.0,
  "category_l1": "餐饮",
  "category_l2": "晚餐",
  "category_l3": "堂食",
  "note": "修改备注",
  "expense_date": "2026-07-31"
}
```

> 修改分类时校验新分类必须存在且属于当前用户。`updated_at` 自动更新。  
> HTTP 200，返回修改后的完整记录（字段同 GET /expenses 单条记录）。

**DELETE /api/v1/expenses/{id}**：
> HTTP 204 No Content。记录不存在返回 404。

### 3.2 分类管理 CRUD

```
POST   /api/v1/expenses/categories       创建分类
GET    /api/v1/expenses/categories       获取分类树（树形结构返回）
PUT    /api/v1/expenses/categories/{id}  修改分类名称/排序
DELETE /api/v1/expenses/categories/{id}  删除分类（校验无关联记录）
```

**POST /api/v1/expenses/categories 请求体**：

```json
{
  "name": "午餐",
  "parent_id": 1,
  "sort_order": 0
}
```

> `level` 由后端根据 `parent_id` 自动计算（`parent_id=null → level=1`，否则 = `parent.level + 1`），前端无需传入。  
> HTTP 201，返回创建后的完整分类（字段同 GET /categories 中单条节点，不包含 children）。

**PUT /api/v1/expenses/categories/{id}**：
- 只允许修改 `name` 和 `sort_order`，**禁止修改 `parent_id`**（防止级联更新子节点 level 的复杂性）。如需移动分类，用户应删除后重建。
- HTTP 200，返回修改后的分类节点。

**DELETE /api/v1/expenses/categories/{id}**：
- HTTP 204 No Content。校验失败按 §6 边界条件返回 400/404。

**GET /api/v1/expenses/categories 响应**：

```json
{
  "categories": [
    {
      "id": 1,
      "name": "餐饮",
      "level": 1,
      "children": [
        {
          "id": 2,
          "name": "午餐",
          "level": 2,
          "children": [
            { "id": 3, "name": "外卖", "level": 3, "children": [] },
            { "id": 4, "name": "堂食", "level": 3, "children": [] }
          ]
        }
      ]
    }
  ]
}
```

### 3.3 统计 API

```
GET /api/v1/expenses/stats          多维度聚合统计（供图表 + 汇总使用）
GET /api/v1/expenses/multi_summary  六区间累计金额（P10.6 新增）
```

**GET /api/v1/expenses/multi_summary**（零参数，基于当天自动计算区间）：

```json
{
  "current_year": "8888.88",
  "current_month": "888.88",
  "current_week": "88.88",
  "recent_year": "8888.88",
  "recent_month": "888.88",
  "recent_week": "88.88"
}
```

> 区间边界：当年=1月1日~今天、当月=本月1日~今天、当周=本周一~今天、近一年=12个月前~今天(不含起始日)、近一月=30天前~今天、近一周=7天前~今天

**GET /api/v1/expenses/stats 参数**：

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| start_date | str | 必填 | 开始日期 |
| end_date | str | 必填 | 结束日期 |
| group_by | str | `"none"` | 聚合粒度：none（不分组，返回总计）/ month / week / year |
| category_l1 | str | 可选 | 一级分类过滤 |
| category_l2 | str | 可选 | 二级分类过滤 |
| category_l3 | str | 可选 | 三级分类过滤 |

**当 `group_by="none"` 时（汇总模式）响应**：

```json
{
  "group_by": "none",
  "total_amount": 5432.00,
  "record_count": 85,
  "avg_daily": 175.23,
  "category_breakdown": [
    { "category_l1": "餐饮", "category_l2": null, "category_l3": null, "total": 2100.00, "percentage": 38.7 },
    { "category_l1": "餐饮", "category_l2": "午餐", "category_l3": null, "total": 1200.00, "percentage": 22.1 },
    { "category_l1": "餐饮", "category_l2": "午餐", "category_l3": "外卖", "total": 800.00, "percentage": 14.7 },
    { "category_l1": "餐饮", "category_l2": "午餐", "category_l3": "堂食", "total": 400.00, "percentage": 7.4 },
    { "category_l1": "餐饮", "category_l2": "晚餐", "category_l3": null, "total": 900.00, "percentage": 16.6 },
    { "category_l1": "交通", "category_l2": null, "category_l3": null, "total": 850.00, "percentage": 15.6 },
    { "category_l1": "交通", "category_l2": "公共交通", "category_l3": null, "total": 500.00, "percentage": 9.2 },
    { "category_l1": "交通", "category_l2": "公共交通", "category_l3": "地铁", "total": 300.00, "percentage": 5.5 },
    { "category_l1": "交通", "category_l2": "公共交通", "category_l3": "公交", "total": 200.00, "percentage": 3.7 }
  ]
}
```

> `category_breakdown` 返回 L1+L2+L3 全层级扁平列表（`null` 表示该行为父级汇总行）。  
> 后端实现：SQL `GROUP BY ROLLUP(category_l1, category_l2, category_l3)`（PostgreSQL 语法）。  
> **跨数据库兼容**：SQLite 不支持 ROLLUP，`expense_stats_service.py` 需检测 `DB_TYPE`——SQLite 时用多次 `GROUP BY` + Python 内存 UNION 聚合，PostgreSQL/MySQL 时用原生 ROLLUP。  
> 前端收到后 `buildTree()` 转为嵌套结构喂给三环旭日图和饼图下钻。  
> 堆叠柱状图依照下钻层级渲染——L1 视图取 `category_l2 IS NULL AND category_l3 IS NULL` 的行，点击图例可逐级下钻至 L2 / L3。全屏模式下柱状图使用 `layout="vertical"`（水平条形图）适配手机横屏。

**当 `group_by="month"` 时（分时段模式）响应**：

```json
{
  "group_by": "month",
  "items": [
    {
      "period": "2026-07",
      "total": 5432.00,
      "count": 85,
      "breakdown": [
        { "category_l1": "餐饮", "category_l2": null, "category_l3": null, "total": 2100.00 },
        { "category_l1": "餐饮", "category_l2": "午餐", "category_l3": "外卖", "total": 800.00 },
        { "category_l1": "交通", "category_l2": null, "category_l3": null, "total": 850.00 }
      ]
    }
  ]
}
```

> 原来的 `summary` 和 `stats` 两个端点合并为单一 `/stats` 端点，通过 `group_by` 参数区分汇总与分时段模式，减少前端请求数。

---

## 4. 前端设计

### 4.1 全局导航重构

从当前单路由结构升级为**底部双 Tab 导航栏**：

```
┌─────────────────────────────────────┐
│  App 名称          🌙主题  ⚙设置  │  ← 全局顶栏（40px）
│  /  ←返回                          │  ← 子页面自动显示返回按钮
├─────────────────────────────────────┤
│                                     │
│         当前 Tab 页面内容             │
│                                     │
├─────────────────────────────────────┤
│   ⛽ 油耗          💰 记账           │  ← 底部固定导航栏
└─────────────────────────────────────┘
                                 ● ← 浮动智能 FAB（右下角，可拖拽）
```

- `main.tsx` 路由改造：引入底部导航组件，两个 Tab 对应独立路由 `/fuel` 和 `/expense`
- 现有油耗功能搬家到 `/fuel` 路由下，记账功能挂在 `/expense` 路由
- `/login` 路由不变（不显示底部导航和顶栏，登录页保留独立的主题切换按钮，与全局顶栏通过 `localStorage` + `data-theme` 属性共享主题状态）
- 油耗统计页变为油耗 Tab 内的二级页面
- **全局顶栏**（40px）：位于页面最顶部（底部导航之上），左侧显示 App 名称，右侧放置主题切换（🌓 三态：自动/亮色/暗色）和设置齿轮按钮（⚙）。两个 Tab 共享同一顶栏，切换时顶栏保持不变
- **设置弹窗**（SettingsModal）：点击顶栏或登录页 ⚙ 按钮打开。包含三个区域：
  - **账户**：显示当前登录用户（用户名前缀单字圆圈 + 用户名 + 当前数据库标识），缓存优先 + 后台静默刷新；底部"退出登录"按钮
  - **版本**：显示当前版本号（如 `v0.0.x`）+ "检查更新"按钮，版本更新始终走生产 Supabase，不受数据库切换影响
  - **数据库**（P11）：正式库 / 测试库 radio 切换，切换时先 `/api/v1/health/db` 验证后端可用性，确认弹框后清空 token 跳转登录页
- **双数据库架构**（P11）：后端 `database.py` 维护 `prod_engine` + `test_engine` 双引擎，前端 axios 拦截器自动添加 `X-Database-Env: prod|test` 头，后端 `get_db()` 按请求头选择 Session。`init_db()` 对两个库同时迁移。部署时 `DB_PG_URL_TEST` 环境变量控制
- **智能 FAB**：路由感知浮动按钮，主页点击→跳转统计页，统计页点击→返回主页。支持自由拖拽，位置持久化 localStorage。可扩展 routeActions 映射表

#### 统计与分类管理入口（Phase 10.5 重构）

- 油耗统计：`/fuel/stats` — 通过 FAB 或 TopBar 返回按钮导航，占满全屏独立页面
- 记账统计：`/expense/stats` — 全屏独立页面，内联折叠式分类管理，含饼图下钻/堆叠柱状图/旭日图
- **已移除**：BottomPanel 底部抽屉组件（含 CategoryManager + FuelStatsPanel + StatsPanel），统一改为全屏独立页面 + SmartFAB 导航

#### App.tsx 重构清单

现有 `App.tsx`（约 400 行，15+ 个 useState）需要拆分为：

| 拆出到 TopBar | 留在 App.tsx |
|--------------|-------------|
| 主题切换逻辑 (`theme`, `handleToggleTheme`) | 车辆选择器 + 添加车辆表单 |
| | 加油表单（里程/油量/金额/提交） |
| | 记录列表 + 编辑/删除 + 分页加载更多 |
| | 筛选面板 |
| | 导出 CSV 按钮 |
| | 版本更新检测弹窗 |

> **P11 变更**：退出登录从 TopBar 移入 SettingsModal，「设置」齿轮按钮已存在于 TopBar 和 LoginPage。

#### 旧路由兼容迁移

重构后以下路由变更，需做兼容处理：

| 旧路由 | 新路由 | 处理 |
|--------|--------|------|
| `/` | `/fuel` | 301 重定向 |
| `/stats` | `/fuel/stats` | 301 重定向 |
| `/login` | `/login` | 不变 |

### 4.2 记账主页面（单页设计）

**页面结构**（自上而下）：

1. **顶部金额输入区** — 大号数字输入框，使用原生 `<input type="number" inputmode="decimal">` + CSS 大字号，移动端自动弹出数字键盘
2. **CategoryPicker 合并选择器** — 单个输入框替代三个级联下拉框。关闭状态显示已选路径（如 `餐饮 / 午餐 / 外卖`），点击展开面板。面板内含搜索框（实时过滤级联树）+ Top 5 常用分类快捷入口 + 级联树（每级末尾"+ 新建"）。`localStorage` 记忆上次选择并自动回填。面板打开时渲染 `<div>` 避免移动端弹出键盘，二次点击切换为 `<input>` 可搜索。面板打开时锁定 body 滚动。

> **CategoryPicker 功能细节**：
> - **搜索**：中文模糊匹配 L1/L2/L3 任意一级，匹配结果实时过滤级联树，不匹配拼音
> - **Top 5 常用分类**：面板顶部优先展示完整三级路径，按提交次数排序。提交成功 +1、删除 –1、编辑不改计数。最近 7 天懒清理过期数据。存储在 `localStorage` key `expense_category_counts`
> - **上次选择记忆**：`localStorage` key `expense_last_category`，打开页面时自动回填上次选的三级分类。分类被删则回退到空
> - **新建分类**：每级末尾"+ 新建"，弹窗标题带完整父级路径（如"新建「餐饮 / 午餐」下的分类"）
> - **冷启动**：用户无任何分类时，级联树为空，仅显示"+ 新建"
3. **日期选择器** — 默认当天，可修改
4. **备注输入框** — 可选
5. **提交按钮** — 大号圆角按钮，提交中 disabled + loading
6. **历史记录列表** — 日期倒序，每条三行堆叠布局：第一行分类路径（`nowrap` 完整展示）、第二行金额 + 编辑按钮（靠右对齐）、第三行日期 + 备注。左滑删除手势（删除按钮跟手滑出，`translateX` JS inline 实时驱动），露出渐变红"删除"后点击删除。支持分页"加载更多"（每页 20 条）。空状态显示"还没记过账"。
7. **ExpenseSummaryCards 统计卡片** — 六区间累计金额（P10.6 新增）：两行三列 grid，每个卡片两行一列（金额 + 标签），标签为当年/当月/当周/近一年/近一月/近一周。`GET /api/v1/expenses/multi_summary` 一次返回全部数据，页面进入和新增/删除后自动刷新。无数据时显示 `¥0.00`。
8. **统计入口** — 通过 SmartFAB 浮动按钮跳转 `/expense/stats` 全屏统计页
9. **PullToRefresh 下拉刷新**（P10.6 新增）— 页面顶部下拉刷新，触摸手势检测 `.layout-content` 的 scrollTop，仅顶部触发。垂直偏移 > 水平偏移 × 1.6 避免与左滑删除冲突。串行刷新：先 records 后 multi_summary。刷新期间展示 ExpensePageSkeleton。
10. **ExpensePageSkeleton 骨架屏**（P10.6 新增）— 页面首次加载和下拉刷新时显示，布局与真实页面完全一致：金额输入 → 分类选择器 → 日期/备注行 → 提交按钮 → 6 统计卡片 → 4 条记录。`::after` 伪元素 gradient + `translateX` 动画闪动。

#### 记账统计全屏页（`/expense/stats`）

- **汇总卡片**：总支出、记录数、日均支出
- **时间快捷选择**：本月 / 本年 / 近一周 / 自定义日期范围
- **饼图下钻**（`recharts PieChart`）：初始显示一级分类饼图 → 点击扇区 → 下钻到二级 → 再点 → 三级 + 明细列表
- **堆叠柱状图**（`recharts BarChart`）：X 轴=时间段，默认按一级分类分色堆叠，点击图例可逐级下钻至 L2/L3。全屏模式使用 `layout="vertical"`（水平条形图）适配手机横屏。
- **明细表**：纯 HTML table，列出所选时间段 + 分类下的所有支出明细
- **分类管理**：通过"管理分类"按钮展开/折叠，树形展示含 `├──`/`└──` 线段（`tree` 命令风格），通用 CategoryModal 弹框处理重命名/添加分类，添加按钮始终可见并带 CSS 虚线延伸至按钮

### 4.3 组件树

```
main.tsx
├── FuelDataProvider（包裹 /fuel 和 /fuel/stats，跨路由共享 vehicles/records/filters 等）
├── ExpenseDataProvider（包裹 /expense 和 /expense/stats，跨路由共享 categories/expenses 等）
├── TopBar（全局顶栏 — App名称/子页返回 + 主题切换 + ⚙ 设置）
├── BottomNav（底部双 Tab 导航）
├── /fuel → App.tsx（现有油耗主页，路由从 / 改为 /fuel，使用 useFuelData()）
│   └── /fuel/stats → StatsPage.tsx（油耗统计全屏页，使用 useFuelData()）
├── /expense → ExpensePage.tsx（记账主页，使用 useExpenseData()）
│   ├── PullToRefresh（P10.6：下拉刷新容器，刷新期间显示 ExpensePageSkeleton）
│   ├── AmountInput（金额输入）
│   ├── CategoryPicker（合并三级选择器：搜索 + Top5 常用 + 级联树）
│   ├── DatePicker（日期选择，毛玻璃样式对齐 CategoryPicker）
│   ├── NoteInput（备注输入，毛玻璃样式对齐）
│   ├── ExpenseSummaryCards（P10.6：六区间累计金额卡片，两行三列）
│   ├── ExpenseList（三行堆叠布局：分类 / 金额+编辑 / 日期+备注，左滑删除）
│   └── /expense/stats → ExpenseStatsPage.tsx（记账统计全屏页，使用 useExpenseData()）
│       ├── 饼图下钻（recharts Pie，递归下钻 + "其他"归并）
│       ├── 堆叠柱状图（recharts BarChart，图例下钻）
│       ├── DetailTable（明细表）
│       └── CategoryManager（折叠式分类管理，tree 线段可视化 + CategoryModal 弹框）
├── SmartFAB（智能浮动导航按钮，路由感知，可拖拽）
├── SettingsModal（设置弹窗：账户信息 + 版本检查 + 数据库切换）
└── /login → LoginPage.tsx（登录页，保持不变）
```

---

## 5. 后端文件清单

```
backend/
├── models/
│   ├── user.py                      # 修改：补充 expenses + categories relationship（cascade delete）
│   ├── expense_category.py          # 新增：ExpenseCategory ORM 模型
│   └── expense.py                   # 新增：Expense ORM 模型
├── schemas/
│   ├── expense.py                   # 新增：ExpenseCreate/Response/Update, CategoryCreate/Response
│   └── expense_stats.py             # 新增：StatsResponse（注意与 fuel 统计的 schemas/stats.py 区分）
├── routers/
│   ├── expenses.py                  # 新增：支出记录 CRUD 路由
│   └── expense_categories.py        # 新增：分类管理 + 统计路由
├── services/
│   ├── expense_service.py           # 新增：支出记录业务逻辑
│   └── expense_stats_service.py     # 新增：统计聚合业务逻辑（含 DB_TYPE 兼容 ROLLUP）
├── alembic/versions/
│   └── xxx_add_expense_tables.py    # 新增：expenses + expense_categories 表迁移
```

```
frontend/src/
├── context/
│   ├── FuelDataContext.tsx           # 加油数据 Context（P10.5）：vehicles/records/filters 跨路由共享
│   └── ExpenseDataContext.tsx        # 记账数据 Context（P10.5）：categories/expenses 跨路由共享
├── components/
│   ├── BottomNav.tsx                 # 底部双 Tab 导航（💰 记账 / ⛽ 油耗）
│   ├── TopBar.tsx                    # 全局顶栏：App名称 + 返回按钮 + 主题切换 + ⚙ 设置
│   ├── SettingsModal.tsx             # 设置弹窗（P11）：账户信息 + 版本检查 + 数据库切换
│   ├── Layout.tsx                    # 全局布局：TopBar + Outlet + BottomNav + SmartFAB
│   ├── SmartFAB.tsx                  # 智能浮动按钮：路由感知 + 拖拽 + 位置持久化
│   ├── CategoryPicker.tsx           # 合并三级分类选择器：搜索 + Top5 常用 + 级联树 + 记忆
│   ├── ExpenseSummaryCards.tsx       # 六区间累计金额卡片（P10.6）
│   ├── ExpensePageSkeleton.tsx       # 记账页骨架屏（P10.6）
│   ├── PullToRefresh.tsx             # 下拉刷新通用组件（P10.6）
├── pages/
│   ├── ExpensePage.tsx              # 记账主页：金额 + CategoryPicker + 日期/备注 + 提交 + 统计卡片 + 三行堆叠列表 + 下拉刷新
│   └── ExpenseStatsPage.tsx         # 记账统计全屏页：汇总卡片 + 饼图下钻/柱状图 + 分类管理（tree线段+弹框）
├── services/
│   └── api.ts                       # API 服务层：Expense/ExpenseCategory 类型 + 全部 API 函数（含 getDatabaseEnv/setDatabaseEnv）
└── main.tsx                         # 路由入口：DataProviders 同时挂载两个 Context（P10.6），Tab 切换不重新 fetch
```

---

## 6. 边界条件与异常处理

| 场景 | 处理方式 |
|------|---------|
| 金额为 0 或负数 | Pydantic 校验拦截（`Field(gt=0)`） |
| 用户无任何分类（冷启动） | 分类选择区显示"创建你的第一个分类"引导按钮，点击弹出分类管理面板 |
| 分类不存在或不属于当前用户 | 返回 404 |
| 删除有子分类的父分类 | 拒绝，提示先删除子分类；未来可支持递归删除（当所有子孙分类均无关联支出记录时） |
| 删除有关联记录的分类 | 拒绝，提示该分类下有 N 条记录 |
| 分类名重复（同用户同级同父） | 返回 409 Conflict |
| 分类链不合法（L1→L2→L3 不构成父子关系） | 返回 400 "分类层级关系不正确" |
| 尝试在三级分类下创建子分类 | 返回 400 "分类最多支持 3 层" |
| 选择一级分类后，二级/三级无数据 | 显示"暂无子分类，点击添加" |
| 重命名分类 | 不自动更新历史记录中的分类名（保留创建时快照） |
| 记账列表为空 | 显示空状态"还没记过账" |
| 统计时间范围内无数据 | 饼图/柱状图显示灰色空状态占位 |
| `start_date = end_date`（单日查询） | `avg_daily = total_amount`（天数视为 1，避免除零） |
| 提交中重复点击 | 按钮 disabled |
| 网络错误 | Toast 提示，不关闭面板 |

---

## 7. 新增依赖

> 所有图表统一使用 `recharts`，无需额外依赖。

---

> **本规格书基于 `/grill-me` 五轮架构盘问产出，设计决策已全部闭环。**
>
> **关联文档**：
> - 项目总规格书：[README.md](file:///Users/zp/Code/fuel_records/README.md)
> - 任务拆解清单：[README.tickets.md](file:///Users/zp/Code/fuel_records/README.tickets.md)
> - 目录结构：[DIR.md](file:///Users/zp/Code/fuel_records/DIR.md)
