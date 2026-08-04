import { useState, useMemo } from 'react'
import type { BreakdownItem, PeriodItem } from '../services/api'

/* ================================================================
   图表下钻算法：getLevelItems / computePieData / computeBarData / useDrilldown
   ================================================================ */

export const OTHER_THRESHOLD = 0.05

/* -------------------- getLevelItems -------------------- */

export interface LevelItemsResult {
  items: { name: string; value: number }[]
  level: number
  l1Name: string
  l2Name: string
}

export function getLevelItems(
  breakdown: BreakdownItem[],
  path: string[],
): LevelItemsResult {
  let level = 1
  let l1Name = ''
  let l2Name = ''
  let showOther = false

  for (const seg of path) {
    if (seg === '__other__') {
      showOther = !showOther
    } else if (level === 1) {
      l1Name = seg
      level = 2
    } else if (level === 2) {
      l2Name = seg
      level = 3
    }
  }

  let items: { name: string; value: number }[] = []
  if (level === 1) {
    items = breakdown
      .filter((b) => b.category_l2 === null && b.category_l3 === null)
      .map((b) => ({ name: b.category_l1 || '未分类', value: Number(b.total) }))
  } else if (level === 2) {
    items = breakdown
      .filter(
        (b) =>
          b.category_l1 === l1Name &&
          b.category_l2 !== null &&
          b.category_l3 === null,
      )
      .map((b) => ({ name: b.category_l2 || '', value: Number(b.total) }))
  } else {
    items = breakdown
      .filter(
        (b) =>
          b.category_l1 === l1Name &&
          b.category_l2 === l2Name &&
          b.category_l3 !== null,
      )
      .map((b) => ({ name: b.category_l3 || '', value: Number(b.total) }))
  }

  if (!showOther) return { items, level, l1Name, l2Name }

  // 过滤出被归入"其他"的项（上一级中 <5% 的部分）
  const total = items.reduce((s, i) => s + i.value, 0)
  if (total === 0) return { items: [], level, l1Name, l2Name }
  const hidden = items.filter((i) => i.value / total < OTHER_THRESHOLD)
  return { items: hidden, level, l1Name, l2Name }
}

/* -------------------- computePieData -------------------- */

export interface PieDatum {
  name: string
  value: number
}

export function computePieData(
  breakdown: BreakdownItem[] | undefined,
  drillPath: string[],
): PieDatum[] {
  if (!breakdown) return []
  const { items } = getLevelItems(breakdown, drillPath)
  const total = items.reduce((s, i) => s + i.value, 0)
  if (total === 0) return []

  const major = items.filter((i) => i.value / total >= OTHER_THRESHOLD)
  const minor = items.filter((i) => i.value / total < OTHER_THRESHOLD)
  const result: PieDatum[] = [...major]
  if (minor.length > 0 && major.length > 0) {
    result.push({
      name: '其他',
      value: minor.reduce((s, i) => s + i.value, 0),
    })
  } else if (minor.length > 0) {
    result.push(...minor)
  }
  return result
}

/* -------------------- computeBarData -------------------- */

export interface BarDatum {
  period: string
  [key: string]: number | string
}

export function computeBarData(
  monthlyData: PeriodItem[] | null,
  barDrillL1: string | null,
  barDrillL2: string | null,
): BarDatum[] {
  if (!monthlyData) return []
  if (!barDrillL1) {
    // L1: 一级分类
    const l1Set = new Set<string>()
    monthlyData.forEach((p) => {
      p.breakdown
        .filter(
          (b) =>
            b.category_l2 === null &&
            b.category_l3 === null &&
            b.category_l1,
        )
        .forEach((b) => l1Set.add(b.category_l1!))
    })
    const keys = Array.from(l1Set)
    return monthlyData.map((p) => {
      const row: Record<string, number | string> = { period: p.period }
      keys.forEach((k) => {
        row[k] = 0
      })
      p.breakdown
        .filter(
          (b) =>
            b.category_l2 === null &&
            b.category_l3 === null &&
            b.category_l1,
        )
        .forEach((b) => {
          row[b.category_l1!] = Number(b.total)
        })
      return row
    })
  } else if (!barDrillL2) {
    // L2: barDrillL1 下的二级分类
    const l2Set = new Set<string>()
    monthlyData.forEach((p) => {
      p.breakdown
        .filter(
          (b) =>
            b.category_l1 === barDrillL1 &&
            b.category_l2 !== null &&
            b.category_l3 === null &&
            b.category_l2,
        )
        .forEach((b) => l2Set.add(b.category_l2!))
    })
    const keys = Array.from(l2Set)
    if (keys.length === 0) return []
    return monthlyData.map((p) => {
      const row: Record<string, number | string> = { period: p.period }
      keys.forEach((k) => {
        row[k] = 0
      })
      p.breakdown
        .filter(
          (b) =>
            b.category_l1 === barDrillL1 &&
            b.category_l2 !== null &&
            b.category_l3 === null &&
            b.category_l2,
        )
        .forEach((b) => {
          row[b.category_l2!] = Number(b.total)
        })
      return row
    })
  } else {
    // L3: barDrillL1 / barDrillL2 下的三级分类
    const l3Set = new Set<string>()
    monthlyData.forEach((p) => {
      p.breakdown
        .filter(
          (b) =>
            b.category_l1 === barDrillL1 &&
            b.category_l2 === barDrillL2 &&
            b.category_l3 !== null &&
            b.category_l3,
        )
        .forEach((b) => l3Set.add(b.category_l3!))
    })
    const keys = Array.from(l3Set)
    if (keys.length === 0) return []
    return monthlyData.map((p) => {
      const row: Record<string, number | string> = { period: p.period }
      keys.forEach((k) => {
        row[k] = 0
      })
      p.breakdown
        .filter(
          (b) =>
            b.category_l1 === barDrillL1 &&
            b.category_l2 === barDrillL2 &&
            b.category_l3 !== null &&
            b.category_l3,
        )
        .forEach((b) => {
          row[b.category_l3!] = Number(b.total)
        })
      return row
    })
  }
}

/* -------------------- useDrilldown -------------------- */

export function useDrilldown() {
  const [drillPath, setDrillPath] = useState<string[]>([])
  const [barDrillL1, setBarDrillL1] = useState<string | null>(null)
  const [barDrillL2, setBarDrillL2] = useState<string | null>(null)

  function resetDrill() {
    setDrillPath([])
    setBarDrillL1(null)
    setBarDrillL2(null)
  }

  return {
    drillPath,
    setDrillPath,
    barDrillL1,
    setBarDrillL1,
    barDrillL2,
    setBarDrillL2,
    resetDrill,
  }
}
