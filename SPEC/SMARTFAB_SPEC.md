# SmartFAB 智能预测引擎 — 技术规格书

> **关联文档**：[`CONTEXT.md`](../CONTEXT.md) — 术语表

---

## 1. 核心目标

将 SmartFAB 从"静态路由映射的悬浮快捷按钮"进化为**基于用户行为上下文预测下一步操作的智能入口**。

**业务痛点**：
- 当前 SmartFAB 仅在列表页 ↔ 统计页之间做机械跳转，每次都要多步点击才能到达真正想做的事
- 用户高频行为模式（如"记完账必看统计"、"在统计页总切柱状图"）没有被系统识别和利用
- 无学习能力——无论用户用一个礼拜还是用一年，FAB 的行为完全一样

**目标**：用户打开 App，FAB 上显示的就是他大概率下一步想做的事。点一下就到。预测错了也有备选菜单兜底。

---

## 2. 核心逻辑与用户交互

### 2.1 预测 → 执行 → 学习 闭环

```
┌─────────────────────────────────────────────────────┐
│                  用户打开页面                          │
│                      │                               │
│              ┌───────▼───────┐                        │
│              │ 采集上下文快照  │  ← PredictionContext    │
│              └───────┬───────┘                        │
│                      │                               │
│              ┌───────▼───────┐                        │
│              │  规则匹配 +    │                        │
│              │  权重排序      │  ← 预测引擎            │
│              └───────┬───────┘                        │
│                      │                               │
│         ┌────────────▼────────────┐                   │
│         │  FAB 显示预测动作        │                   │
│         │  (图标 + 文字标签)       │                   │
│         │  高置信度 → 脉冲动效     │                   │
│         └────────────┬────────────┘                   │
│                      │                               │
│         用户点击 FAB  │  用户长按 FAB                  │
│              │                │                       │
│     ┌────────▼────────┐  ┌───▼──────────────┐        │
│     │ 执行预测动作      │  │ 弹出备选菜单       │        │
│     │ → 记录"命中"     │  │ → 用户选其他动作   │        │
│     │ → 权重 +1       │  │ → 记录"未命中"    │        │
│     └─────────────────┘  │ → 权重调整 (-1/+1) │        │
│                          └──────────────────┘        │
│                      │                               │
│              ┌───────▼───────┐                        │
│              │  更新行为日志   │  ← localStorage       │
│              └───────┬───────┘                        │
│                      │                               │
│              ┌───────▼───────┐                        │
│              │  检查规则生成   │  ← 7天/3次阈值         │
│              │  检查规则淘汰   │  ← 每日一次             │
│              └───────────────┘                        │
└─────────────────────────────────────────────────────┘
```

### 2.2 FAB 交互设计

**单击**：执行当前预测的 Top-1 动作

**长按（500ms）**：弹出备选菜单
- 顶部高亮区：当前预测动作（带权重和置信度标识）
- 下方列表：当前上下文下其他可用的动作，按权重降序排列
- 点击菜单项 = 执行该动作 + 更新权重

**置信度动效**：
| 置信度 | FAB 动效 |
|--------|---------|
| 低（≤ 2） | 当前柔和的呼吸光晕 |
| 高（> 2） | 升级为显眼脉冲 + 微微缩放 |

### 2.3 调试页面 `/predict/rules`

从设置弹窗进入，独立全屏页面，包含：
- **规则列表**：所有规则（种子/生成/临时），显示条件、动作、权重、命中次数、最近命中时间
- **行为日志时间线**：最近 50 条 FAB 点击记录
- **手动操作**：重置所有权重、清空行为日志、删除单条规则

---

## 3. 技术设计与状态管理

### 3.1 新增文件清单

```
frontend/src/
├── context/
│   └── PredictionContext.tsx     # 新建：双向通道（状态上报 + 动作下发）
├── engine/
│   ├── types.ts                  # 新建：Action / Rule / RuleCondition / ContextSnapshot / BehaviorLog 类型定义
│   ├── engine.ts                 # 新建：预测引擎核心（规则匹配、权重更新、规则生成/淘汰）
│   ├── seedRules.ts              # 新建：6 条种子规则定义
│   ├── storage.ts                # 新建：localStorage 读写封装
│   └── actions.ts                # 新建：11 种 Action 的 execute() 实现
├── components/
│   ├── SmartFAB.tsx              # 修改：接入预测引擎，替换 routeActions 映射
│   ├── SmartFAB.css              # 修改：新增脉冲动效、备选菜单样式
│   ├── SettingsModal.tsx         # 修改：新增"预测引擎规则"入口
│   └── Layout.tsx                # 修改：包裹 PredictionContext.Provider
├── pages/
│   ├── ExpensePage.tsx           # 修改：同步状态到 PredictionContext + 响应 Action
│   ├── ExpenseStatsPage.tsx      # 修改：同步状态 + 响应 Action
│   ├── PredictRulesPage.tsx      # 新建：调试页面
│   └── PredictRulesPage.css      # 新建：调试页面样式
├── hooks/
│   └── useChartDrilldown.ts      # 不修改（已在上一个任务中修复）
└── main.tsx                      # 修改：注册 /predict/rules 路由
```

### 3.2 核心类型定义

```typescript
// ── 上下文快照 ──
interface ContextSnapshot {
  page: string                       // 当前路由 e.g. '/expense' '/fuel/stats'
  hasRecordsToday: boolean           // 今天是否有记录
  chartType?: 'pie' | 'bar'         // 仅统计页
  isFullscreen: boolean              // 是否图表全屏
  isEditing: boolean                 // 是否编辑模式
  isFilterOpen: boolean              // 筛选面板是否展开
  hour: number                       // 当前小时 0-23
  dayOfWeek: number                  // 星期几 0-6
}

// ── 规则条件 ──
interface RuleCondition {
  page?: string                      // 精确匹配，未设置 = 通配
  hasRecordsToday?: boolean
  chartType?: 'pie' | 'bar'
  isFullscreen?: boolean
  isEditing?: boolean
  isFilterOpen?: boolean
  hourRange?: [number, number]       // 范围匹配
  dayOfWeek?: number[]
}

// ── 动作 ──
type Action =
  | { type: 'navigate'; target: string }
  | { type: 'scroll_to_top' }
  | { type: 'switch_chart'; chart: 'pie' | 'bar' }
  | { type: 'toggle_fullscreen' }
  | { type: 'focus_amount_input' }
  | { type: 'quick_record' }
  | { type: 'toggle_filter' }

// ── 规则 ──
interface Rule {
  id: string
  condition: RuleCondition
  action: Action
  weight: number                     // 动态权重
  type: 'seed' | 'generated' | 'temporary'
  hitCount: number                   // 总命中次数
  missCount: number                  // 总误判次数
  lastHitAt: string                  // ISO 时间戳
  lastMissAt: string
  createdAt: string
}

// ── 行为日志条目 ──
interface BehaviorLogEntry {
  timestamp: string
  context: ContextSnapshot
  chosenAction: Action
  predictedAction: Action | null     // null = 无匹配规则
  wasHit: boolean
}

// ── PredictionContext 值 ──
interface PredictionContextValue {
  // 页面 → 引擎：状态上报
  updatePageState: (partial: Partial<ContextSnapshot>) => void
  
  // 引擎 → 页面：动作下发
  pendingAction: Action | null
  consumePendingAction: () => Action | null
  
  // 引擎公开数据（供调试页读取）
  currentPrediction: { action: Action; confidence: number } | null
  rules: Rule[]
}
```

### 3.3 预测引擎核心算法

**规则匹配**：`RuleCondition` 的每个已设置字段都必须与 `ContextSnapshot` 一致

**预测输出**：
```
1. 过滤：找出所有 condition 匹配当前 ContextSnapshot 的规则
2. 排序：按 weight 降序
3. 计算置信度：top1.weight - top2.weight（若无 top2 则为 top1.weight）
4. 返回 top1.action
```

**规则自动生成**（每次 FAB 点击后触发）：
```
1. 从行为日志中查询最近 7 天内，同一 (context条件hash, action类型) 的事件数
2. 若 ≥ 3 次 → 检查规则池是否已有此规则
   - 无 → 创建 generated 类型规则，初始 weight = 3
   - 有且为 temporary → 升级为 generated
```

**规则淘汰**（每日一次，页面加载时触发）：
```
遍历所有规则：
  - seed 且 weight ≤ -5 → 删除
  - generated 且 weight ≤ 0 且 14天内未命中 且 30天内命中 ≤ 1 → 删除
  - temporary 且 createdAt 距今 > 7天 且 从未命中 → 删除
```

### 3.4 种子规则

```typescript
const SEED_RULES: Omit<Rule, 'id' | 'hitCount' | 'missCount' | 'lastHitAt' | 'lastMissAt'>[] = [
  {
    condition: { page: '/expense', hasRecordsToday: false },
    action: { type: 'focus_amount_input' },
    weight: 3, type: 'seed',
    createdAt: '2026-08-06',
  },
  {
    condition: { page: '/expense', hasRecordsToday: true },
    action: { type: 'navigate', target: '/expense/stats' },
    weight: 3, type: 'seed',
    createdAt: '2026-08-06',
  },
  {
    condition: { page: '/expense/stats' },
    action: { type: 'navigate', target: '/expense' },
    weight: 3, type: 'seed',
    createdAt: '2026-08-06',
  },
  {
    condition: { page: '/fuel' },
    action: { type: 'navigate', target: '/fuel/stats' },
    weight: 3, type: 'seed',
    createdAt: '2026-08-06',
  },
  {
    condition: { page: '/fuel/stats' },
    action: { type: 'navigate', target: '/fuel' },
    weight: 3, type: 'seed',
    createdAt: '2026-08-06',
  },
  {
    condition: { chartType: 'pie' },
    action: { type: 'switch_chart', chart: 'bar' },
    weight: 1, type: 'seed',
    createdAt: '2026-08-06',
  },
]
```

### 3.5 localStorage 数据格式

| Key | 内容 | 预估大小 |
|-----|------|---------|
| `fab_rules` | `Rule[]` JSON | ~5KB |
| `fab_behavior_log` | `BehaviorLogEntry[]` JSON，最多保留 365 天 | ~100KB |

### 3.6 动作执行器映射

每个动作需要在对应页面组件中实现执行逻辑：

| Action Type | 执行位置 | 实现方式 |
|-------------|---------|---------|
| `navigate` | SmartFAB 自身 | `useNavigate()` |
| `scroll_to_top` | ExpensePage / App | `window.scrollTo({ top: 0, behavior: 'smooth' })` |
| `switch_chart` | ExpenseStatsPage / StatsPage | 设置本地 `chartType` state |
| `toggle_fullscreen` | ExpenseStatsPage / StatsPage | 设置本地 `fullscreenChart` state |
| `focus_amount_input` | ExpensePage | `.focus()` DOM 引用 |
| `quick_record` | ExpensePage | 使用上次选择的分类 + 当前时间调 `createExpense()` |
| `toggle_filter` | App（油耗页） | `setShowFilter()` |

---

## 4. 边界条件与异常处理

### 4.1 冷启动
- 首次使用：仅种子规则可用，权重均为初始值
- FAB 上显示的内容由种子规则决定
- 前 7 天无自动生成规则（不够 3 次阈值）

### 4.2 数据异常
- `localStorage` 读取失败 → 回退到空规则池 + 空日志，等于冷启动
- `localStorage` 写入失败 → 静默失败，不阻塞用户操作（下次页面重载数据丢失，但核心功能不受影响）
- 规则池超过 100 条 → 自动清理 weight 最低的 temporary 类型规则
- 日志超过 365 天 → 按时间截断

### 4.3 动作执行异常
- `quick_record` 执行时网络失败 → 提示用户"记账失败，请重试"，记一次 miss
- 非导航类动作的目标组件已卸载 → 静默忽略（`consumePendingAction` 返回 null 后不做任何事）
- `toggle_fullscreen` 但当前页面不支持全屏 → 静默忽略

### 4.4 性能保障
- 规则匹配：O(n) 遍历，n ≤ 100，单次匹配 < 1ms
- 行为日志查询：只在规则生成时做（点击 FAB 后），不在页面切换时做
- 规则淘汰：只在页面首次加载时执行一次
- `PredictionContext` 的状态更新使用 `useRef` 避免不必要的重渲染

### 4.5 兼容性
- 预测引擎不可用时（如 localStorage 被禁用），FAB 降级为当前行为（routeActions 静态映射）
- 旧用户的 `fab_position` 等 localStorage key 不受影响，预测引擎使用独立 key 前缀 `fab_`

### 4.6 种子规则淘汰保护
- 即使种子规则被淘汰，不影响其他种子规则
- 若全部种子规则被淘汰（极端情况），FAB 降级为当前静态路由映射
