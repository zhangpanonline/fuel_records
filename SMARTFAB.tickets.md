# SmartFAB 智能预测引擎 — 原子任务清单

> **规格书**：[`SMARTFAB_SPEC.md`](./SMARTFAB_SPEC.md)
> **术语表**：[`CONTEXT.md`](./CONTEXT.md)

---

## 依赖拓扑排序

```
Ticket 1 (types + storage + seedRules)
  └─→ Ticket 2 (engine 核心)
        ├─→ Ticket 3 (PredictionContext)
        │     ├─→ Ticket 4 (SmartFAB UI 改造)
        │     ├─→ Ticket 5 (页面集成：ExpensePage + ExpenseStatsPage)
        │     ├─→ Ticket 6 (页面集成：App 油耗页 + StatsPage)
        │     └─→ Ticket 7 (SettingsModal 入口 + PredictRulesPage 调试页)
        └─→ Ticket 8 (Layout + main.tsx 路由注册)
```

---

## Ticket 1: 基础骨架 — 类型定义 + localStorage 封装 + 种子规则

**依赖**：无

**任务**：
- [x] 创建 `frontend/src/engine/types.ts`，定义全部类型：
  - `ContextSnapshot`、`RuleCondition`、`Action`（含 7 个判别式联合成员）、`Rule`、`BehaviorLogEntry`、`PredictionContextValue`
- [x] 创建 `frontend/src/engine/storage.ts`，封装 localStorage 读写：
  - `loadRules(): Rule[]` — 从 `fab_rules` key 读取，失败返回 `[]`
  - `saveRules(rules: Rule[]): void` — 写入 `fab_rules`，失败静默
  - `loadBehaviorLog(): BehaviorLogEntry[]` — 从 `fab_behavior_log` 读取，截断超过 365 天的条目
  - `saveBehaviorLog(log: BehaviorLogEntry[]): void` — 写入，失败静默
- [x] 创建 `frontend/src/engine/seedRules.ts`，按规格书 3.4 定义 6 条种子规则（使用 `Omit<Rule, 'id' | ...>` 类型），同时导出 `createSeedRules(): Rule[]` 工厂函数用于初始化规则池（首次加载时调用）

---

## Ticket 2: 预测引擎核心 — 规则匹配 + 权重更新 + 生成/淘汰

**依赖**：Ticket 1

**任务**：
- [x] 创建 `frontend/src/engine/engine.ts`
- [x] 实现 `createEngine()` 工厂函数，接收 `Rule[]` + `BehaviorLogEntry[]`，返回引擎实例
- [x] `predict(ctx: ContextSnapshot): { action: Action; confidence: number } | null`
  - 遍历规则池，`matchCondition(rule.condition, ctx)` 筛选匹配规则
  - 按 `weight` 降序排序
  - `confidence = top1.weight - (top2?.weight ?? 0)`
  - 无匹配规则返回 `null`
- [x] `matchCondition(cond: RuleCondition, ctx: ContextSnapshot): boolean`
  - 遍历 `cond` 的每个已设置字段，逐一比对
  - `page` / `chartType` / `hasRecordsToday` / `isFullscreen` / `isEditing` / `isFilterOpen`：精确匹配
  - `hourRange`：`ctx.hour >= range[0] && ctx.hour <= range[1]`
  - `dayOfWeek`：`dayOfWeek.includes(ctx.dayOfWeek)`
- [x] `recordFeedback(ctx, chosenAction, predictedAction, wasHit)`
  - 更新预测规则的权重：命中 +1，未命中 -1
  - 更新被选动作对应规则的权重（如果不在预测中）：+1，若无对应规则则创建 temporary
  - 追加 `BehaviorLogEntry` 到日志
  - 触发生成检查 `tryGenerateRule(ctx, chosenAction)`
- [x] `tryGenerateRule(ctx, chosenAction)`
  - 从日志中统计最近 7 天内同一 `(conditionHash, actionType)` 的事件数
  - `conditionHash` = 对 `ctx` 中每个字段做语义哈希（精确匹配字段序列化 + 范围字段区间化）
  - 若 ≥ 3 次 且规则池中无对应规则 → 创建 `generated` 类型规则，weight = 3
  - 若已有 temporary 类型规则 → 升级为 generated
- [x] `runElimination()` — 每日一次淘汰
  - seed 且 weight ≤ -5 → 删除
  - generated 且 weight ≤ 0 且 14 天内未命中 且 30 天内命中 ≤ 1 → 删除
  - temporary 且 createdAt > 7 天前 且 从未命中 → 删除
  - 规则池超过 100 条 → 清理 weight 最低的 temporary
- [x] `serialize(): { rules: Rule[]; log: BehaviorLogEntry[] }` — 导出当前状态
- [x] 引擎初始化时调用 `runElimination()`（每日一次）

---

## Ticket 3: PredictionContext — 双向状态通道

**依赖**：Ticket 1（类型定义）

**任务**：
- [x] 创建 `frontend/src/context/PredictionContext.tsx`
- [x] `PredictionContext` = `createContext<PredictionContextValue | null>(null)`
- [x] `PredictionProvider` 组件：
  - 初始化时从 `storage.ts` 加载规则和日志，创建引擎实例
  - `useRef` 持有引擎实例（避免重新创建）
  - 维护 `currentPrediction` 和 `rules` 状态
  - 维护 `pendingAction` 状态
  - `updatePageState(partial)` — 合并到内部 `contextSnapshot` ref → 调用 `engine.predict()` → 更新 `currentPrediction`
  - `consumePendingAction()` — 读取并清空 `pendingAction`
  - 暴露 `rules`（供调试页使用）
  - 路由切换时（监听 `location.pathname`）重新触发预测
- [x] 导出 `usePrediction()` hook（封装 `useContext` + null 检查）

---

## Ticket 4: SmartFAB UI 改造 — 预测显示 + 长按菜单 + 置信度动效

**依赖**：Ticket 2, Ticket 3

**任务**：
- [x] 修改 `frontend/src/components/SmartFAB.tsx`
  - 移除 `routeActions` 静态映射
  - 接入 `usePrediction()` hook
  - **单击逻辑**：若 `currentPrediction` 存在 → 执行 `action`；若无预测 → 降级到静态路由映射（保留当前 routeActions 作为降级方案）
  - **长按逻辑**：`onTouchStart` / `onMouseDown` 记录起始时间，500ms 后显示备选菜单
  - 备选菜单组件：显示当前上下文下所有匹配规则的动作，按权重降序，当前预测置顶高亮
  - **置信度动效**：`confidence > 2` 时添加 CSS class `smart-fab--high-confidence`
  - `navigate` 动作由 FAB 自身执行（`useNavigate`），其他动作写入 `pendingAction`
- [x] 动作图标映射：为 11 种 Action 每种定义图标 + 短标签
  - `navigate` → 根据 target 不同显示 📊/💰/⛽/📋
  - `scroll_to_top` → ⬆ "回顶部"
  - `switch_chart:bar` → 📊 "柱状图"
  - `switch_chart:pie` → 🥧 "饼图"
  - `toggle_fullscreen` → ⛶ "全屏"
  - `focus_amount_input` → ✏️ "记一笔"
  - `quick_record` → ⚡ "快记"
  - `toggle_filter` → 🔍 "筛选"
- [x] 修改 `frontend/src/components/SmartFAB.css`
  - 新增 `.smart-fab--high-confidence` 脉冲动效（比当前呼吸光晕更强）
  - 新增备选菜单样式（`.fab-menu-overlay` + `.fab-menu` + `.fab-menu-item`）

---

## Ticket 5: 页面集成（一）— ExpensePage + ExpenseStatsPage

**依赖**：Ticket 3

**任务**：
- [x] 修改 `frontend/src/pages/ExpensePage.tsx`
  - 调用 `usePrediction().updatePageState()` 同步页面状态：
    - `page: '/expense'`
    - `hasRecordsToday`: 从 `expenses` 中统计 `expense_date === today` 的记录数 > 0
    - `isEditing`: `editingId !== null`
    - `hour` / `dayOfWeek`: `new Date()`
  - 监听 `pendingAction`：在 `useEffect` 中处理
    - `scroll_to_top` → `window.scrollTo()`
    - `focus_amount_input` → 对金额 input 的 ref 调用 `.focus()`
    - `quick_record` → 使用 `CategoryPicker` 的"上次选择"记忆 + 当前日期 + 默认金额，调 `createExpense()`；网络失败提示错误
    - 执行后调用 `consumePendingAction()`
- [x] 修改 `frontend/src/pages/ExpenseStatsPage.tsx`
  - 调用 `usePrediction().updatePageState()` 同步：
    - `page: '/expense/stats'`
    - `chartType`: 当前 `chartType` state
    - `isFullscreen`: `fullscreenChart !== null`
    - `hour` / `dayOfWeek`
  - 监听 `pendingAction`：
    - `switch_chart:pie` / `switch_chart:bar` → `setChartType()`
    - `toggle_fullscreen` → 切换 `fullscreenChart`
    - 执行后 `consumePendingAction()`

---

## Ticket 6: 页面集成（二）— App 油耗页 + StatsPage

**依赖**：Ticket 3

**任务**：
- [x] 修改 `frontend/src/App.tsx`（油耗页）
  - 调用 `usePrediction().updatePageState()` 同步：
    - `page: '/fuel'`
    - `hasRecordsToday`: 统计当日加油记录
    - `isFilterOpen`: `showFilter` state
    - `hour` / `dayOfWeek`
  - 注意：`hasRecordsToday` 需要从 `records` 中过滤 `record_date === today`
  - 监听 `pendingAction`：
    - `scroll_to_top` → `window.scrollTo()`
    - `toggle_filter` → `setShowFilter(v => !v)`
    - 执行后 `consumePendingAction()`
- [x] 修改 `frontend/src/pages/StatsPage.tsx`（油耗统计页）
  - 先通读该文件，理解其图表状态结构
  - 调用 `usePrediction().updatePageState()` 同步 `page: '/fuel/stats'` 和图表相关状态
  - 监听 `pendingAction` 处理 `switch_chart` 和 `toggle_fullscreen`

---

## Ticket 7: SettingsModal 入口 + PredictRulesPage 调试页

**依赖**：Ticket 2, Ticket 3

**任务**：
- [x] 修改 `frontend/src/components/SettingsModal.tsx`
  - 在"显示"和"数据库"两个 section 之间新增一个 `settings-section`：
    - 标题："预测引擎"
    - 描述："查看 SmartFAB 预测规则和行为日志"
    - 按钮："查看规则" → `onClose()` 后 `navigate('/predict/rules')`
  - 注意：`SettingsModal` 本身没有 `useNavigate`，需要通过 props 传入或使用 window 跳转。建议在 `Layout.tsx` 中通过 `onNavigate` prop 传入
- [x] 创建 `frontend/src/pages/PredictRulesPage.tsx`
  - 读取 `usePrediction().rules`（全部规则）
  - **规则列表区**：表格展示每条规则的条件摘要、动作名称、权重（带颜色：正数绿/负数红）、类型标签（种子/生成/临时）、命中次数、最近命中时间
  - **行为日志区**：时间线形式展示最近 50 条日志，每条显示时间、上下文摘要、选择的动作、是否命中（✅/❌）
  - **操作区**：
    - "重置所有权重" → 所有权重归零，调用引擎方法后 `saveRules()`
    - "清空行为日志" → `saveBehaviorLog([])`，同时重置引擎日志
    - 每条规则旁有删除按钮（带二次确认）
- [x] 创建 `frontend/src/pages/PredictRulesPage.css` — 调试页样式

---

## Ticket 8: Layout 包裹 + main.tsx 路由注册

**依赖**：Ticket 3

**任务**：
- [x] 修改 `frontend/src/components/Layout.tsx`
  - 用 `<PredictionProvider>` 包裹 `<Outlet />`、`<BottomNav />`、`<SmartFAB />`
  - 路由变化时（`useLocation`），不直接传值给 Provider——Provider 内部已监听 `location`
  - 给 `SettingsModal` 传入 `onNavigate` prop（配合 Ticket 7 的跳转需求）
- [x] 修改 `frontend/src/main.tsx`
  - 新增路由：`{ path: '/predict/rules', element: <PredictRulesPage /> }`
  - 注意需导入 `PredictRulesPage`，且 `/docs` 页不需要 BottomNav/SmartFAB，`/predict/rules` 页同样不需要——在 `Layout.tsx` 中判断 `isDocsPage || isPredictPage` 即可

---

## Ticket 9: 边界防御与鲁棒性增强

**依赖**：Ticket 1-8 全部

**任务**：
- [x] `localStorage` 读取失败时，引擎能正常运行（冷启动状态），不崩溃
- [x] `localStorage` 写入失败时，静默 catch，不阻塞用户操作
- [x] `quick_record` 网络失败时，弹出提示"记账失败，请重试"，并记一次 miss
- [x] 非导航 Action 的目标组件已卸载（如页面已切换）时，`consumePendingAction` 返回 null 后不执行任何操作
- [x] 规则匹配为空时（全量种子规则被淘汰），FAB 降级为当前 `routeActions` 静态映射
- [x] 引擎实例使用 `useRef`，避免 React 重渲染导致引擎重建
- [x] 规则池 > 100 条时自动清理（在每次 `saveRules` 前检查）
- [x] 确保 FAB 拖拽仍正常工作（与预测逻辑不冲突）
- [x] 确保 `/docs` 页不触发预测（Provider 内判断路由）
