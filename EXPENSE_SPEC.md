# Expense Tracker — 个人记账功能规格书

> 在 Fuel Records 油耗记录 App 中集成个人记账模块。用户数据共享（同一 User 模型 + JWT 鉴权），记账数据完全隔离。

---

## 1. 核心目标

为 Fuel Records App 增加一个独立的个人记账功能，解决"我的钱花在哪了"的日常追踪需求。与油耗记录平行存在，共用登录体系但数据互不关联。

### 学习目标
- **树形数据模型**：自引用分类表（parent_id），掌握递归查询与扁平化技巧
- **多维度聚合查询**：SQLAlchemy GROUP BY + 时间维度（年/月/周/自定义）
- **D3-based 可视化**：`@nivo/sunburst` 旭日图 + `recharts` 堆叠柱状图/饼图下钻
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
```

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
> 前端收到后 `buildTree()` 转为嵌套结构喂给旭日图和饼图下钻。  
> 堆叠柱状图只取 `category_l2 IS NULL AND category_l3 IS NULL` 的行（即一级分类汇总）。

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
│  App 名称          🌙主题   🚪退出   │  ← 全局顶栏（40px）
├─────────────────────────────────────┤
│                                     │
│         当前 Tab 页面内容             │
│                                     │
├─────────────────────────────────────┤
│   ⛽ 油耗          💰 记账           │  ← 底部固定导航栏
└─────────────────────────────────────┘
```

- `main.tsx` 路由改造：引入底部导航组件，两个 Tab 对应独立路由 `/fuel` 和 `/expense`
- 现有油耗功能搬家到 `/fuel` 路由下，记账功能挂在 `/expense` 路由
- `/login` 路由不变（不显示底部导航和顶栏，登录页保留独立的主题切换按钮，与全局顶栏通过 `localStorage` + `data-theme` 属性共享主题状态）
- 油耗统计页变为油耗 Tab 内的二级页面
- **全局顶栏**（40px）：位于页面最顶部（底部导航之上），左侧显示 App 名称，右侧放置主题切换和退出登录按钮。两个 Tab 共享同一顶栏，切换时顶栏保持不变

#### App.tsx 重构清单

现有 `App.tsx`（约 400 行，15+ 个 useState）需要拆分为：

| 拆出到 TopBar | 留在 App.tsx |
|--------------|-------------|
| 主题切换逻辑 (`theme`, `handleToggleTheme`) | 车辆选择器 + 添加车辆表单 |
| 退出登录逻辑 (`handleLogout`) | 加油表单（里程/油量/金额/提交） |
| | 记录列表 + 编辑/删除 + 分页加载更多 |
| | 筛选面板 |
| | 导出 CSV 按钮 |
| | 加油提醒开关 |
| | 版本更新检测弹窗 |

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
2. **分类级联选择区** — 三个级联下拉框（一级 → 二级 → 三级），选择后显示完整路径。当用户无任何分类时，显示"创建你的第一个分类"引导按钮，点击后弹出分类管理面板开始创建

> **CategoryPicker 级联协议**：
> - 页面挂载时调用 `GET /categories` 获取分类树，提取所有 `level=1` 节点填入 L1 下拉框
> - 用户选择 L1 → 从分类树的 `L1.children` 中提取所有节点填入 L2 下拉框（L3 清空）
> - 用户选择 L2 → 从 `L2.children` 中提取节点填入 L3 下拉框
> - 每级下拉框末尾有"+ 新建"选项，选中后弹出快速创建输入框（输入名称，回车创建，自动选中新分类）
> - 冷启动时三个下拉框全空，L1 显示"+ 新建"选项
3. **日期选择器** — 默认当天，可修改
4. **备注输入框** — 可选
5. **提交按钮** — 大号圆角按钮，提交中 disabled + loading
6. **历史记录列表** — 按日期倒序，每条显示：分类路径（格式 `餐饮 / 午餐 / 外卖`，颜色递减灰阶）、金额、备注、日期。右侧有编辑按钮（点击回填表单，提交变"更新"）和删除按钮；支持左滑删除（使用 CSS `transform: translateX()` + `touchstart/touchend` 事件手写手势，无需额外库依赖）
7. **底部弹出面板入口** — 浮动按钮，点击弹出底部面板，面板内部顶部两个 Tab 切换子面板：

#### 底部弹出面板 — 分类管理

- 树形展示用户的所有分类（一级→二级→三级）
- 支持添加/编辑/删除节点
- 删除时校验该分类下是否有支出记录

#### 底部弹出面板 — 统计图表

- **时间快捷选择**：本月 / 本年 / 近一周 / 自定义日期范围
- **旭日图**（`@nivo/sunburst`）：从中心向外依次是一级→二级→三层分类，面积=金额，支持点击放大
- **堆叠柱状图**（`recharts BarChart`）：X 轴=时间段（月/周/年），每柱按一级分类分色堆叠
- **饼图下钻**（`recharts PieChart`）：初始显示一级分类饼图 → 点击扇区 → 下钻到二级 → 再点 → 三级 + 明细列表
- **明细表**：纯 HTML table，列出所选时间段 + 分类下的所有支出明细

### 4.3 组件树

```
main.tsx
├── TopBar（新增：全局顶栏 — App名称 + 主题切换 + 退出登录）
├── BottomNav（新增：底部双 Tab 导航）
├── /fuel → App.tsx（现有油耗主页，路由从 / 改为 /fuel）
│   └── /fuel/stats → StatsPage.tsx（现有油耗统计页）
├── /expense → ExpensePage.tsx（新增：记账主页）
│   ├── AmountInput（金额输入）
│   ├── CategoryPicker（三级分类级联选择）
│   ├── DatePicker（日期选择）
│   ├── ExpenseList（历史记录列表）
│   └── BottomPanel（底部弹出面板）
│       ├── CategoryManager（分类管理）
│       └── StatsPanel（统计图表）
│           ├── SunburstChart（@nivo/sunburst）
│           ├── StackedBarChart（recharts）
│           ├── PieDrilldown（recharts，饼图下钻）
│           └── DetailTable（明细表）
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

> 还需修改以下现有文件：
> - `backend/main.py`：注册 `expenses_router` 和 `categories_router` 两个新路由
> - `backend/models/__init__.py`：导入 `Expense` 和 `ExpenseCategory`（供 Alembic autogenerate 检测）
> - `backend/alembic/env.py`：导入 `Expense` 和 `ExpenseCategory` 模型（使 `Base.metadata` 包含新表）
> - `backend/database.py`：`init_db()` 中导入 `Expense` 和 `ExpenseCategory`（启动时 metadata 完整）
> - `backend/tests/conftest.py`：`client` fixture 注册 2 个新路由；测试文件需新增支出模块测试

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
| 统计时间范围内无数据 | 旭日图/饼图显示灰色空状态占位 |
| 旭日图数据量过大（>200 节点） | 三级分类合并展示，只显示两层 |
| `start_date = end_date`（单日查询） | `avg_daily = total_amount`（天数视为 1，避免除零） |
| 底部弹出面板打开时滚动穿透 | 锁定 body 滚动，面板内部独立滚动 |
| 提交中重复点击 | 按钮 disabled |
| 网络错误 | Toast 提示，不关闭面板 |

---

## 7. 新增依赖

| 包 | 用途 |
|---|---|
| `@nivo/sunburst` | 旭日图 |
| `@nivo/core` | @nivo/sunburst 的 peer dependency |

> 实际安装：`npm install @nivo/sunburst @nivo/core`。现有 `recharts` 继续用于堆叠柱状图和饼图下钻。

---

> **本规格书基于 `/grill-me` 五轮架构盘问产出，设计决策已全部闭环。**
>
> **关联文档**：
> - 项目总规格书：[README.md](file:///Users/zp/Code/fuel_records/README.md)
> - 任务拆解清单：[README.tickets.md](file:///Users/zp/Code/fuel_records/README.tickets.md)
> - 目录结构：[DIR.md](file:///Users/zp/Code/fuel_records/DIR.md)
