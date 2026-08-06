/** 种子规则定义 + 工厂函数 */

import type { Rule } from './types'

type SeedRuleInput = Omit<Rule, 'id' | 'hitCount' | 'missCount' | 'lastHitAt' | 'lastMissAt'>

const SEED_RULE_DEFS: SeedRuleInput[] = [
  {
    condition: { page: '/expense', hasRecordsToday: false },
    action: { type: 'focus_amount_input' },
    weight: 3,
    type: 'seed',
    createdAt: '2026-08-06T00:00:00.000Z',
  },
  {
    condition: { page: '/expense', hasRecordsToday: true },
    action: { type: 'navigate', target: '/expense/stats' },
    weight: 3,
    type: 'seed',
    createdAt: '2026-08-06T00:00:00.000Z',
  },
  {
    condition: { page: '/expense/stats' },
    action: { type: 'navigate', target: '/expense' },
    weight: 3,
    type: 'seed',
    createdAt: '2026-08-06T00:00:00.000Z',
  },
  {
    condition: { page: '/fuel' },
    action: { type: 'navigate', target: '/fuel/stats' },
    weight: 3,
    type: 'seed',
    createdAt: '2026-08-06T00:00:00.000Z',
  },
  {
    condition: { page: '/fuel/stats' },
    action: { type: 'navigate', target: '/fuel' },
    weight: 3,
    type: 'seed',
    createdAt: '2026-08-06T00:00:00.000Z',
  },
  {
    condition: { chartType: 'pie' },
    action: { type: 'switch_chart', chart: 'bar' },
    weight: 1,
    type: 'seed',
    createdAt: '2026-08-06T00:00:00.000Z',
  },
]

let idCounter = 0

function makeId(): string {
  idCounter++
  return `seed_${idCounter}_${Date.now()}`
}

export function createSeedRules(): Rule[] {
  return SEED_RULE_DEFS.map((def) => ({
    ...def,
    id: makeId(),
    hitCount: 0,
    missCount: 0,
    lastHitAt: '',
    lastMissAt: '',
  }))
}

export function getNextId(): string {
  return `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
