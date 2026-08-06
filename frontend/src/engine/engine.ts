/** 预测引擎核心 — 规则匹配 / 权重更新 / 规则生成与淘汰 */

import type {
  ContextSnapshot,
  RuleCondition,
  Action,
  Rule,
  BehaviorLogEntry,
  PredictionEngine,
} from './types'
import { createSeedRules, getNextId } from './seedRules'
import {
  loadRules,
  saveRules,
  loadBehaviorLog,
  saveBehaviorLog,
  getLastEliminationDate,
  setLastEliminationDate,
} from './storage'

// ── 常量 ──

const GENERATION_WINDOW_DAYS = 7
const GENERATION_THRESHOLD = 3
const SEED_ELIMINATION_THRESHOLD = -5
const GENERATED_NO_HIT_DAYS = 14
const GENERATED_LOW_HIT_DAYS = 30
const TEMP_RULE_EXPIRE_DAYS = 7
const RULE_POOL_LIMIT = 100

// ── 条件匹配 ──

export function matchCondition(cond: RuleCondition, ctx: ContextSnapshot): boolean {
  if (cond.page !== undefined && cond.page !== ctx.page) return false
  if (cond.hasRecordsToday !== undefined && cond.hasRecordsToday !== ctx.hasRecordsToday) return false
  if (cond.chartType !== undefined && cond.chartType !== ctx.chartType) return false
  if (cond.isFullscreen !== undefined && cond.isFullscreen !== ctx.isFullscreen) return false
  if (cond.isEditing !== undefined && cond.isEditing !== ctx.isEditing) return false
  if (cond.isFilterOpen !== undefined && cond.isFilterOpen !== ctx.isFilterOpen) return false
  if (cond.hourRange) {
    if (ctx.hour < cond.hourRange[0] || ctx.hour > cond.hourRange[1]) return false
  }
  if (cond.dayOfWeek) {
    if (!cond.dayOfWeek.includes(ctx.dayOfWeek)) return false
  }
  return true
}

// ── 上下文哈希（用于规则自动生成的模式识别） ──

function contextHash(ctx: ContextSnapshot): string {
  const parts: string[] = [
    `p:${ctx.page}`,
    `rt:${ctx.hasRecordsToday}`,
    `ct:${ctx.chartType ?? '_'}`,
    `fs:${ctx.isFullscreen}`,
    `ed:${ctx.isEditing}`,
    `fo:${ctx.isFilterOpen}`,
    `h:${ctx.hour}`,
    `dw:${ctx.dayOfWeek}`,
  ]
  return parts.join('|')
}

function actionHash(action: Action): string {
  switch (action.type) {
    case 'navigate': return `navigate:${action.target}`
    case 'switch_chart': return `switch_chart:${action.chart}`
    default: return action.type
  }
}

function conditionMatchesContext(cond: RuleCondition, ctx: ContextSnapshot): boolean {
  if (cond.page !== undefined && cond.page !== ctx.page) return false
  if (cond.hasRecordsToday !== undefined && cond.hasRecordsToday !== ctx.hasRecordsToday) return false
  if (cond.chartType !== undefined && cond.chartType !== ctx.chartType) return false
  if (cond.isFullscreen !== undefined && cond.isFullscreen !== ctx.isFullscreen) return false
  if (cond.isEditing !== undefined && cond.isEditing !== ctx.isEditing) return false
  if (cond.isFilterOpen !== undefined && cond.isFilterOpen !== ctx.isFilterOpen) return false
  if (cond.hourRange) {
    if (ctx.hour < cond.hourRange[0] || ctx.hour > cond.hourRange[1]) return false
  }
  if (cond.dayOfWeek) {
    if (!cond.dayOfWeek.includes(ctx.dayOfWeek)) return false
  }
  return true
}

function findRuleByConditionAndAction(
  rules: Rule[],
  ctx: ContextSnapshot,
  action: Action,
): Rule | undefined {
  return rules.find(
    (r) =>
      conditionMatchesContext(r.condition, ctx) &&
      actionHash(r.action) === actionHash(action),
  )
}

// ── 引擎工厂 ──

export function createEngine(initialRules?: Rule[], initialLog?: BehaviorLogEntry[]): PredictionEngine {
  let rules: Rule[] = initialRules ?? []
  let behaviorLog: BehaviorLogEntry[] = initialLog ?? []

  // 初始化：若规则池为空，加载持久化数据；若仍为空，使用种子规则
  if (rules.length === 0) {
    rules = loadRules()
  }
  if (rules.length === 0) {
    rules = createSeedRules()
    saveRules(rules)
  }
  if (behaviorLog.length === 0) {
    behaviorLog = loadBehaviorLog()
  }

  // 初始化时执行每日淘汰
  runDailyElimination()

  function persist() {
    saveRules(rules)
    saveBehaviorLog(behaviorLog)
  }

  function predict(ctx: ContextSnapshot): { action: Action; confidence: number } | null {
    const matched = rules.filter((r) => matchCondition(r.condition, ctx))
    if (matched.length === 0) return null

    matched.sort((a, b) => b.weight - a.weight)
    const top1 = matched[0]
    const top2 = matched[1]
    const confidence = top1.weight - (top2?.weight ?? 0)

    return { action: top1.action, confidence }
  }

  function recordFeedback(
    ctx: ContextSnapshot,
    chosenAction: Action,
    predictedAction: Action | null,
    wasHit: boolean,
  ): void {
    const now = new Date().toISOString()

    // 更新预测规则的权重
    if (predictedAction) {
      const predictedRule = findRuleByConditionAndAction(rules, ctx, predictedAction)
      if (predictedRule) {
        if (wasHit) {
          predictedRule.weight += 1
          predictedRule.hitCount += 1
          predictedRule.lastHitAt = now
        } else {
          predictedRule.weight -= 1
          predictedRule.missCount += 1
          predictedRule.lastMissAt = now
        }
      }
    }

    // 更新被选动作对应规则的权重
    if (!wasHit || !predictedAction) {
      const chosenRule = findRuleByConditionAndAction(rules, ctx, chosenAction)
      if (chosenRule) {
        chosenRule.weight += 1
        chosenRule.hitCount += 1
        chosenRule.lastHitAt = now
      } else {
        // 创建临时规则
        const tempRule: Rule = {
          id: getNextId(),
          condition: contextToCondition(ctx),
          action: chosenAction,
          weight: 1,
          type: 'temporary',
          hitCount: 1,
          missCount: 0,
          lastHitAt: now,
          lastMissAt: '',
          createdAt: now,
        }
        rules.push(tempRule)
      }
    }

    // 追加行为日志
    behaviorLog.push({
      timestamp: now,
      context: { ...ctx },
      chosenAction,
      predictedAction,
      wasHit,
    })

    // 触发生成检查
    tryGenerateRule(ctx, chosenAction)

    persist()
  }

  function contextToCondition(ctx: ContextSnapshot): RuleCondition {
    return {
      page: ctx.page,
      hasRecordsToday: ctx.hasRecordsToday,
      chartType: ctx.chartType,
      isFullscreen: ctx.isFullscreen,
      isEditing: ctx.isEditing,
      isFilterOpen: ctx.isFilterOpen,
      hourRange: [ctx.hour, ctx.hour],
      dayOfWeek: [ctx.dayOfWeek],
    }
  }

  function tryGenerateRule(ctx: ContextSnapshot, chosenAction: Action): void {
    const ch = contextHash(ctx)
    const ah = actionHash(chosenAction)

    const cutoff = Date.now() - GENERATION_WINDOW_DAYS * 24 * 60 * 60 * 1000
    const recentEvents = behaviorLog.filter(
      (e) =>
        new Date(e.timestamp).getTime() >= cutoff &&
        contextHash(e.context) === ch &&
        actionHash(e.chosenAction) === ah,
    )

    if (recentEvents.length < GENERATION_THRESHOLD) return

    const existingRule = rules.find(
      (r) =>
        conditionMatchesContext(r.condition, ctx) &&
        actionHash(r.action) === ah,
    )

    if (!existingRule) {
      const generatedRule: Rule = {
        id: getNextId(),
        condition: contextToCondition(ctx),
        action: chosenAction,
        weight: 3,
        type: 'generated',
        hitCount: 0,
        missCount: 0,
        lastHitAt: '',
        lastMissAt: '',
        createdAt: new Date().toISOString(),
      }
      rules.push(generatedRule)
    } else if (existingRule.type === 'temporary') {
      existingRule.type = 'generated'
    }
  }

  function runDailyElimination(): void {
    const today = new Date().toISOString().slice(0, 10)
    const lastRun = getLastEliminationDate()
    if (lastRun === today) return

    const now = Date.now()
    const genNoHitCutoff = now - GENERATED_NO_HIT_DAYS * 24 * 60 * 60 * 1000
    const genLowHitCutoff = now - GENERATED_LOW_HIT_DAYS * 24 * 60 * 60 * 1000
    const tempExpireCutoff = now - TEMP_RULE_EXPIRE_DAYS * 24 * 60 * 60 * 1000

    rules = rules.filter((r) => {
      // seed 淘汰：权重 ≤ -5
      if (r.type === 'seed' && r.weight <= SEED_ELIMINATION_THRESHOLD) return false

      // generated 淘汰：权重 ≤ 0 且 14天内未命中 且 30天内命中 ≤ 1
      if (r.type === 'generated') {
        if (r.weight <= 0) {
          const lastHitTime = r.lastHitAt ? new Date(r.lastHitAt).getTime() : 0
          if (lastHitTime < genNoHitCutoff && r.hitCount <= 1) return false
        }
      }

      // temporary 淘汰：7天未命中
      if (r.type === 'temporary') {
        const createdAt = new Date(r.createdAt).getTime()
        const lastHitTime = r.lastHitAt ? new Date(r.lastHitAt).getTime() : 0
        if (createdAt < tempExpireCutoff && lastHitTime < tempExpireCutoff) return false
      }

      return true
    })

    // 规则池超过上限：清理 weight 最低的 temporary
    if (rules.length > RULE_POOL_LIMIT) {
      const tempRules = rules
        .filter((r) => r.type === 'temporary')
        .sort((a, b) => a.weight - b.weight)
      const toRemove = tempRules.slice(0, rules.length - RULE_POOL_LIMIT)
      const removeIds = new Set(toRemove.map((r) => r.id))
      rules = rules.filter((r) => !removeIds.has(r.id))
    }

    setLastEliminationDate(today)
    persist()
  }

  function getRules(): Rule[] {
    return [...rules]
  }

  function resetAllWeights(): void {
    rules.forEach((r) => {
      r.weight = r.type === 'seed' ? 3 : 0
      r.hitCount = 0
      r.missCount = 0
      r.lastHitAt = ''
      r.lastMissAt = ''
    })
    // 清除生成的规则，只保留种子规则
    rules = rules.filter((r) => r.type === 'seed')
    persist()
  }

  function clearBehaviorLog(): void {
    behaviorLog = []
    persist()
  }

  function deleteRule(id: string): void {
    rules = rules.filter((r) => r.id !== id)
    persist()
  }

  function serialize(): { rules: Rule[]; log: BehaviorLogEntry[] } {
    return { rules: [...rules], log: [...behaviorLog] }
  }

  // 对外暴露 runElimination 以便手动调用
  return {
    predict,
    recordFeedback,
    getRules,
    resetAllWeights,
    clearBehaviorLog,
    deleteRule,
    serialize,
  }
}
