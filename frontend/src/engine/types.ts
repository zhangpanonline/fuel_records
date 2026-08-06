/** SmartFAB 预测引擎 — 全部类型定义 */

// ── 上下文快照 ──

export interface ContextSnapshot {
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

export interface RuleCondition {
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

export type Action =
  | { type: 'navigate'; target: string }
  | { type: 'scroll_to_top' }
  | { type: 'switch_chart'; chart: 'pie' | 'bar' }
  | { type: 'toggle_fullscreen' }
  | { type: 'focus_amount_input' }
  | { type: 'quick_record' }
  | { type: 'toggle_filter' }

// ── 规则 ──

export interface Rule {
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

export interface BehaviorLogEntry {
  timestamp: string
  context: ContextSnapshot
  chosenAction: Action
  predictedAction: Action | null     // null = 无匹配规则
  wasHit: boolean
}

// ── PredictionContext 值 ──

export interface PredictionContextValue {
  // 页面 → 引擎：状态上报
  updatePageState: (partial: Partial<ContextSnapshot>) => void

  // 引擎 → 页面：动作下发
  pendingAction: Action | null
  consumePendingAction: () => Action | null

  // 引擎公开数据（供调试页读取）
  currentPrediction: { action: Action; confidence: number } | null
  rules: Rule[]

  // 手动操作（供调试页使用）
  resetAllWeights: () => void
  clearBehaviorLog: () => void
  deleteRule: (id: string) => void
}

// ── 引擎实例接口 ──

export interface PredictionEngine {
  predict: (ctx: ContextSnapshot) => { action: Action; confidence: number } | null
  recordFeedback: (
    ctx: ContextSnapshot,
    chosenAction: Action,
    predictedAction: Action | null,
    wasHit: boolean,
  ) => void
  getRules: () => Rule[]
  resetAllWeights: () => void
  clearBehaviorLog: () => void
  deleteRule: (id: string) => void
  serialize: () => { rules: Rule[]; log: BehaviorLogEntry[] }
}

// ── 动作的图标和标签映射 ──

export interface ActionDisplay {
  icon: string
  label: string
}

export function getActionDisplay(action: Action): ActionDisplay {
  switch (action.type) {
    case 'navigate':
      switch (action.target) {
        case '/expense': return { icon: '💰', label: '记账' }
        case '/expense/stats': return { icon: '📊', label: '记账统计' }
        case '/fuel': return { icon: '⛽', label: '油耗' }
        case '/fuel/stats': return { icon: '📋', label: '油耗统计' }
        default: return { icon: '➡', label: '跳转' }
      }
    case 'scroll_to_top': return { icon: '⬆', label: '回顶部' }
    case 'switch_chart':
      return action.chart === 'bar' ? { icon: '📊', label: '柱状图' } : { icon: '🥧', label: '饼图' }
    case 'toggle_fullscreen': return { icon: '⛶', label: '全屏' }
    case 'focus_amount_input': return { icon: '✏️', label: '记一笔' }
    case 'quick_record': return { icon: '⚡', label: '快记' }
    case 'toggle_filter': return { icon: '🔍', label: '筛选' }
  }
}
