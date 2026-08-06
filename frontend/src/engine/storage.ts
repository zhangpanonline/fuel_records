/** localStorage 读写封装 */

import type { Rule, BehaviorLogEntry } from './types'

const RULES_KEY = 'fab_rules'
const LOG_KEY = 'fab_behavior_log'
const MAX_LOG_DAYS = 365
const MAX_RULES = 100

export function loadRules(): Rule[] {
  try {
    const raw = localStorage.getItem(RULES_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Rule[]
  } catch {
    return []
  }
}

export function saveRules(rules: Rule[]): void {
  try {
    const trimmed = rules.slice(0, MAX_RULES)
    localStorage.setItem(RULES_KEY, JSON.stringify(trimmed))
  } catch {
    // 静默失败
  }
}

export function loadBehaviorLog(): BehaviorLogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY)
    if (!raw) return []
    const log = JSON.parse(raw) as BehaviorLogEntry[]
    const cutoff = Date.now() - MAX_LOG_DAYS * 24 * 60 * 60 * 1000
    return log.filter((e) => new Date(e.timestamp).getTime() >= cutoff)
  } catch {
    return []
  }
}

export function saveBehaviorLog(log: BehaviorLogEntry[]): void {
  try {
    const cutoff = Date.now() - MAX_LOG_DAYS * 24 * 60 * 60 * 1000
    const filtered = log.filter((e) => new Date(e.timestamp).getTime() >= cutoff)
    localStorage.setItem(LOG_KEY, JSON.stringify(filtered))
  } catch {
    // 静默失败
  }
}

export function getLastEliminationDate(): string | null {
  try {
    return localStorage.getItem('fab_last_elimination')
  } catch {
    return null
  }
}

export function setLastEliminationDate(date: string): void {
  try {
    localStorage.setItem('fab_last_elimination', date)
  } catch {
    // 静默失败
  }
}
