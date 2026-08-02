import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import axios from 'axios'
import {
  fetchExpenseStats,
  createCategory,
  updateCategory,
  deleteCategory,
  type ExpenseCategory,
  type BreakdownItem,
  type PeriodItem,
} from '../services/api'
import { useExpenseData } from '../context/ExpenseDataContext'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import './ExpenseStatsPage.css'

/* ================================================================
   常量
   ================================================================ */
type ChartType = 'pie' | 'bar'

const CHART_COLORS = [
  '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
  '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#6e7074',
]

function fmtDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return fmtDate(d)
}

const PERIODS = [
  { key: 'year', label: '近一年', days: 365 },
  { key: 'month', label: '近一月', days: 30 },
  { key: 'week', label: '近一周', days: 7 },
] as const

/* ================================================================
   CategoryModal — 通用分类弹框（重命名/添加）
   ================================================================ */
type ModalMode = 'rename' | 'addChild' | 'addSibling'

function CategoryModal({
  title,
  initialValue,
  error,
  onClose,
  onConfirm,
}: {
  title: string
  initialValue: string
  error: string
  onClose: () => void
  onConfirm: (name: string) => void
}) {
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  function handleConfirm() {
    const v = value.trim()
    if (!v) return
    onConfirm(v)
  }

  return (
    <div className="rename-overlay" onClick={onClose}>
      <div className="rename-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="rename-dialog-title">{title}</div>
        <input
          className="rename-dialog-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); if (e.key === 'Escape') onClose() }}
          autoFocus
        />
        {error && <div className="rename-dialog-error">{error}</div>}
        <div className="rename-dialog-actions">
          <button className="rename-dialog-cancel" onClick={onClose}>取消</button>
          <button className="rename-dialog-ok" onClick={handleConfirm}>确认</button>
        </div>
      </div>
    </div>
  )
}

/* ================================================================
   CategoryNode — 可展开分类节点
   ================================================================ */
function CategoryNode({
  cat,
  depth,
  onRefresh,
  prefix = '',
  isLast = false,
}: {
  cat: ExpenseCategory
  depth: number
  onRefresh: () => void
  prefix?: string
  isLast?: boolean
}) {
  const [expanded, setExpanded] = useState(depth < 2)

  // ── 弹框状态 ──
  const [modalMode, setModalMode] = useState<ModalMode | null>(null)
  const [modalValue, setModalValue] = useState('')
  const [modalError, setModalError] = useState('')

  function closeModal() { setModalMode(null); setModalError('') }

  const canAddChild = cat.level < 3
  const showSiblingAdd = depth === 0 && cat.level === 1
  const childPrefix = depth === 0 ? '' : `${prefix}${isLast ? '  ' : '│ '}`
  const childBranch = showSiblingAdd ? '├' : '└'

  async function handleModalConfirm(name: string) {
    if (modalMode === 'rename') {
      if (name === cat.name) { closeModal(); return }
      try {
        await updateCategory(cat.id, { name })
        closeModal()
        onRefresh()
      } catch (err: unknown) {
        let msg = '修改失败'
        if (axios.isAxiosError(err) && err.response?.data?.detail) msg = err.response.data.detail
        setModalError(msg)
      }
    } else if (modalMode === 'addChild') {
      try {
        await createCategory({ name, parent_id: cat.id })
        closeModal()
        onRefresh()
      } catch (err: unknown) {
        let msg = '创建失败'
        if (axios.isAxiosError(err) && err.response?.data?.detail) msg = err.response.data.detail
        setModalError(msg)
      }
    } else if (modalMode === 'addSibling') {
      try {
        await createCategory({ name })
        closeModal()
        onRefresh()
      } catch (err: unknown) {
        let msg = '创建失败'
        if (axios.isAxiosError(err) && err.response?.data?.detail) msg = err.response.data.detail
        setModalError(msg)
      }
    }
  }

  async function handleDelete() {
    if (!window.confirm(`确定要删除分类"${cat.name}"吗？`)) return
    try {
      await deleteCategory(cat.id)
      onRefresh()
    } catch (err: unknown) {
      let msg = '删除失败'
      if (axios.isAxiosError(err) && err.response?.data?.detail) msg = err.response.data.detail
      alert(msg)
    }
  }

  return (
    <div className="category-node">
      <div className="category-node-header">
        {depth > 0 && (
          <span className="category-node-lines">{prefix}{isLast ? '└── ' : '├── '}</span>
        )}
        <span className="category-node-expand" onClick={() => setExpanded(!expanded)}>
          {cat.children.length > 0 ? (expanded ? '▼' : '▶') : ''}
        </span>
        <span className="category-node-name">{cat.name}</span>
        <div className="category-node-actions">
          <button onClick={() => { setModalValue(cat.name); setModalMode('rename') }}>重命名</button>
          <button onClick={handleDelete}>删除</button>
        </div>
      </div>
      {expanded && (
        <div className="category-children">
          {cat.children.map((child, i) => (
            <CategoryNode
              key={child.id}
              cat={child}
              depth={depth + 1}
              onRefresh={onRefresh}
              prefix={childPrefix}
              isLast={i === cat.children.length - 1 && !canAddChild && !showSiblingAdd}
            />
          ))}
          {canAddChild && (
            <div className="category-add-row">
              <span className="category-node-lines">{childPrefix}</span>
              <span className="category-node-branch">{childBranch}</span>
              <span className="category-add-line" />
              <button className="add-category-btn" onClick={() => { setModalValue(''); setModalMode('addChild') }} data-add-level={cat.level + 1}>
                + 添加{cat.level + 1}级分类
              </button>
            </div>
          )}
          {showSiblingAdd && (
            <div className="category-add-row">
              <span className="category-node-lines">{childPrefix}</span>
              <span className="category-node-branch">└</span>
              <span className="category-add-line" />
              <button className="add-category-btn" data-add-level="1" onClick={() => { setModalValue(''); setModalMode('addSibling') }}>
                + 添加1级分类
              </button>
            </div>
          )}
        </div>
      )}

      {modalMode && (
        <CategoryModal
          title={
            modalMode === 'rename' ? '重命名分类'
            : modalMode === 'addSibling' ? '添加1级分类'
            : `添加${cat.level + 1}级分类`
          }
          initialValue={modalValue}
          error={modalError}
          onClose={closeModal}
          onConfirm={handleModalConfirm}
        />
      )}
    </div>
  )
}

/* ================================================================
   ExpenseStatsPage — 记账统计全屏页
   ================================================================ */
export default function ExpenseStatsPage() {
  const { categories, refreshCategories } = useExpenseData()

  // ── 时间选择 ──
  const today = fmtDate(new Date())
  const [startDate, setStartDate] = useState(daysAgo(30))
  const [endDate, setEndDate] = useState(today)
  const [activePeriod, setActivePeriod] = useState<string>('month')
  const [chartType, setChartType] = useState<ChartType>('pie')
  const [loading, setLoading] = useState(true)
  const [fullscreenChart, setFullscreenChart] = useState<string | null>(null)
  const firstLoad = useRef(true)

  // ── 统计数据 ──
  const [summaryData, setSummaryData] = useState<{
    total_amount: number
    record_count: number
    avg_daily: number
    category_breakdown: BreakdownItem[]
  } | null>(null)

  const [monthlyData, setMonthlyData] = useState<PeriodItem[] | null>(null)
  const [summaryLoaded, setSummaryLoaded] = useState(false)
  const [monthlyLoaded, setMonthlyLoaded] = useState(false)

  // ── 饼图下钻（含"其他"归并） ──
  const [drillPath, setDrillPath] = useState<string[]>([])

  // ── 柱状图下钻 ──
  const [barDrillL1, setBarDrillL1] = useState<string | null>(null)
  const [barDrillL2, setBarDrillL2] = useState<string | null>(null)

  /* ================================================================
     通用的"5% 归并到其他"饼图数据计算
     drillPath: [] = L1根, ['__other__'] = 隐藏L1, ['餐饮'] = L2,
                ['餐饮','__other__'] = 隐藏L2, ['餐饮','正餐'] = L3
     ================================================================ */
  const THRESHOLD = 0.05

  function getLevelItems(breakdown: BreakdownItem[], path: string[]) {
    let level = 1
    let l1Name = ''
    let l2Name = ''
    let showOther = false

    for (const seg of path) {
      if (seg === '__other__') {
        showOther = !showOther
      } else if (level === 1) {
        l1Name = seg; level = 2
      } else if (level === 2) {
        l2Name = seg; level = 3
      }
    }

    let items: { name: string; value: number }[] = []
    if (level === 1) {
      items = breakdown
        .filter((b) => b.category_l2 === null && b.category_l3 === null)
        .map((b) => ({ name: b.category_l1 || '未分类', value: Number(b.total) }))
    } else if (level === 2) {
      items = breakdown
        .filter((b) => b.category_l1 === l1Name && b.category_l2 !== null && b.category_l3 === null)
        .map((b) => ({ name: b.category_l2 || '', value: Number(b.total) }))
    } else {
      items = breakdown
        .filter((b) => b.category_l1 === l1Name && b.category_l2 === l2Name && b.category_l3 !== null)
        .map((b) => ({ name: b.category_l3 || '', value: Number(b.total) }))
    }

    if (!showOther) return { items, level, l1Name, l2Name }

    // 过滤出被归入"其他"的项（上一级中 <5% 的部分）
    const total = items.reduce((s, i) => s + i.value, 0)
    if (total === 0) return { items: [], level, l1Name, l2Name }
    const hidden = items.filter((i) => i.value / total < THRESHOLD)
    return { items: hidden, level, l1Name, l2Name }
  }

  const pieData = useMemo(() => {
    const breakdown = summaryData?.category_breakdown || []
    const { items, level: _level, l1Name: _l1, l2Name: _l2 } = getLevelItems(breakdown, drillPath)
    const total = items.reduce((s, i) => s + i.value, 0)
    if (total === 0) return []

    const major = items.filter((i) => i.value / total >= THRESHOLD)
    const minor = items.filter((i) => i.value / total < THRESHOLD)
    const result = [...major]
    if (minor.length > 0 && major.length > 0) {
      result.push({ name: '其他', value: minor.reduce((s, i) => s + i.value, 0) })
    } else if (minor.length > 0) {
      result.push(...minor)
    }
    return result
  }, [summaryData, drillPath])

  const pieTitle = useMemo(() => {
    const { level, l1Name, l2Name } = getLevelItems(summaryData?.category_breakdown || [], drillPath)
    const inOther = drillPath[drillPath.length - 1] === '__other__'
    let base = ''
    if (level === 1) base = '一级分类'
    else if (level === 2) base = l1Name
    else base = `${l1Name} / ${l2Name}`
    return inOther ? `${base} / 其他` : base
  }, [summaryData, drillPath])

  // ── 分类管理 ──
  const [showCategories, setShowCategories] = useState(false)

  const loadSummary = useCallback(async () => {
    try {
      const stats = await fetchExpenseStats(startDate, endDate, 'none')
      setSummaryData({
        total_amount: stats.total_amount ? Number(stats.total_amount) : 0,
        record_count: stats.record_count || 0,
        avg_daily: stats.avg_daily || 0,
        category_breakdown: stats.category_breakdown || [],
      })
      setSummaryLoaded(true)
    } catch {
      setSummaryData(null)
      setSummaryLoaded(true)
    }
  }, [startDate, endDate])

  const loadMonthly = useCallback(async () => {
    try {
      const stats = await fetchExpenseStats(startDate, endDate, 'month')
      setMonthlyData(stats.items || [])
      setMonthlyLoaded(true)
    } catch {
      setMonthlyData(null)
      setMonthlyLoaded(true)
    }
  }, [startDate, endDate])

  useEffect(() => {
    if (firstLoad.current) {
      setLoading(true)
    }
    setDrillPath([])
    if (chartType === 'bar') {
      setMonthlyLoaded(false)
      loadMonthly()
    } else {
      setSummaryLoaded(false)
      loadSummary()
    }
  }, [startDate, endDate, chartType, loadSummary, loadMonthly])

  useEffect(() => {
    if (chartType === 'bar' ? monthlyLoaded : summaryLoaded) {
      setLoading(false)
      firstLoad.current = false
    }
  }, [summaryLoaded, monthlyLoaded, chartType])

  useEffect(() => {
    if (showCategories) {
      refreshCategories()
    }
  }, [showCategories, refreshCategories])

  // 监听 FAB 点击关闭全屏图表
  useEffect(() => {
    function handleCloseFullscreen() {
      setFullscreenChart(null)
    }
    window.addEventListener('close-chart-fullscreen', handleCloseFullscreen)
    return () => window.removeEventListener('close-chart-fullscreen', handleCloseFullscreen)
  }, [])

  // 全屏状态同步到 window，供 FAB 判断
  useEffect(() => {
    ;(window as any).__chartFullscreenActive = !!fullscreenChart
    return () => { (window as any).__chartFullscreenActive = false }
  }, [fullscreenChart])

  function selectPeriod(days: number, key: string) {
    const end = fmtDate(new Date())
    const start = daysAgo(days)
    setStartDate(start)
    setEndDate(end)
    setActivePeriod(key)
    setBarDrillL1(null)
    setBarDrillL2(null)
  }

  const chartTypes: { key: ChartType; label: string }[] = [
    { key: 'pie', label: '饼图' },
    { key: 'bar', label: '柱状图' },
  ]

  // ── 饼图下钻数据 / 标题 已在上面 useMemo 中定义 ──

  // ── 堆叠柱状图数据（支持下钻） ──
  const barData = useMemo(() => {
    if (!monthlyData) return []
    if (!barDrillL1) {
      // L1: 一级分类
      const l1Set = new Set<string>()
      monthlyData.forEach((p) => {
        p.breakdown
          .filter((b) => b.category_l2 === null && b.category_l3 === null && b.category_l1)
          .forEach((b) => l1Set.add(b.category_l1!))
      })
      const keys = Array.from(l1Set)
      return monthlyData.map((p) => {
        const row: Record<string, number | string> = { period: p.period }
        keys.forEach((k) => { row[k] = 0 })
        p.breakdown
          .filter((b) => b.category_l2 === null && b.category_l3 === null && b.category_l1)
          .forEach((b) => { row[b.category_l1!] = Number(b.total) })
        return row
      })
    } else if (!barDrillL2) {
      // L2: barDrillL1 下的二级分类
      const l2Set = new Set<string>()
      monthlyData.forEach((p) => {
        p.breakdown
          .filter((b) => b.category_l1 === barDrillL1 && b.category_l2 !== null && b.category_l3 === null && b.category_l2)
          .forEach((b) => l2Set.add(b.category_l2!))
      })
      const keys = Array.from(l2Set)
      if (keys.length === 0) return []
      return monthlyData.map((p) => {
        const row: Record<string, number | string> = { period: p.period }
        keys.forEach((k) => { row[k] = 0 })
        p.breakdown
          .filter((b) => b.category_l1 === barDrillL1 && b.category_l2 !== null && b.category_l3 === null && b.category_l2)
          .forEach((b) => { row[b.category_l2!] = Number(b.total) })
        return row
      })
    } else {
      // L3: barDrillL1 / barDrillL2 下的三级分类
      const l3Set = new Set<string>()
      monthlyData.forEach((p) => {
        p.breakdown
          .filter((b) => b.category_l1 === barDrillL1 && b.category_l2 === barDrillL2 && b.category_l3 !== null && b.category_l3)
          .forEach((b) => l3Set.add(b.category_l3!))
      })
      const keys = Array.from(l3Set)
      if (keys.length === 0) return []
      return monthlyData.map((p) => {
        const row: Record<string, number | string> = { period: p.period }
        keys.forEach((k) => { row[k] = 0 })
        p.breakdown
          .filter((b) => b.category_l1 === barDrillL1 && b.category_l2 === barDrillL2 && b.category_l3 !== null && b.category_l3)
          .forEach((b) => { row[b.category_l3!] = Number(b.total) })
        return row
      })
    }
  }, [monthlyData, barDrillL1, barDrillL2])

  const barKeys = useMemo(() => {
    if (barData.length === 0) return []
    return Object.keys(barData[0]).filter((k) => k !== 'period')
  }, [barData])

  const barTitle = useMemo(() => {
    if (!barDrillL1) return '一级分类'
    if (!barDrillL2) return barDrillL1
    return `${barDrillL1} / ${barDrillL2}`
  }, [barDrillL1, barDrillL2])

  const hasPieData = pieData.length > 0

  // ── 饼图图例 ──
  const pieLegendItems = useMemo(() => {
    const total = pieData.reduce((s, i) => s + i.value, 0)
    if (total === 0) return []
    return pieData.map((item, i) => ({
      ...item,
      percent: (item.value / total * 100).toFixed(1),
      color: item.name === '其他' ? '#9ca3af' : CHART_COLORS[i < pieData.length && pieData[i].name === '其他' ? i : i % CHART_COLORS.length],
    }))
  }, [pieData])

  const legendColor = (idx: number, name: string) =>
    name === '其他' ? '#9ca3af' : CHART_COLORS[idx % CHART_COLORS.length]

  return (
    <div className="expense-stats-page">
      {/* 日期范围选择 */}
      <div className="stats-date-row animate-in">
        <div className="stats-date-field">
          <input
            type="date"
            value={startDate}
            max={endDate}
            onChange={(e) => { setStartDate(e.target.value); setActivePeriod('') }}
          />
        </div>
        <span className="stats-date-sep">至</span>
        <div className="stats-date-field">
          <input
            type="date"
            value={endDate}
            min={startDate}
            max={today}
            onChange={(e) => { setEndDate(e.target.value); setActivePeriod('') }}
          />
        </div>
      </div>

      {/* 快捷时段按钮 */}
      <div className="stats-period-row animate-in stagger-1">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            className={`stats-period-btn ${activePeriod === p.key ? 'active' : ''}`}
            onClick={() => selectPeriod(p.days, p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading && <div className="chart-placeholder">加载中...</div>}

      {!loading && !summaryData && (
        <div className="chart-placeholder">加载失败，请重试</div>
      )}

      {!loading && summaryData && (
        <>
          {/* 汇总卡片 */}
          <div className="stats-summary">
            <div className="stats-card">
              <div className="stats-card-value">¥{summaryData.total_amount.toFixed(2)}</div>
              <div className="stats-card-label">总支出</div>
            </div>
            <div className="stats-card">
              <div className="stats-card-value">{summaryData.record_count}</div>
              <div className="stats-card-label">笔数</div>
            </div>
            <div className="stats-card">
              <div className="stats-card-value">¥{summaryData.avg_daily.toFixed(2)}</div>
              <div className="stats-card-label">日均</div>
            </div>
          </div>

          {/* 图表类型切换 */}
          <div className="stats-time-row" style={{ marginTop: 8 }}>
            {chartTypes.map((ct) => (
              <button
                key={ct.key}
                className={`stats-time-btn ${chartType === ct.key ? 'active' : ''}`}
                onClick={() => {
                  setChartType(ct.key)
                  setBarDrillL1(null)
                  setBarDrillL2(null)
                  if (ct.key !== 'bar') {
                    setDrillPath([])
                  }
                }}
              >
                {ct.label}
              </button>
            ))}
          </div>

          {/* 饼图下钻 */}
          {chartType === 'pie' && (
            <div className="chart-section">
              <button className="chart-fullscreen-btn" onClick={() => setFullscreenChart('pie')} title="全屏">⛶</button>
              <div className="pie-drill-header">
                {drillPath.length > 0 && (
                  <button
                    className="stats-time-btn"
                    onClick={() => setDrillPath((p) => p.slice(0, -1))}
                  >
                    ← 返回
                  </button>
                )}
                <span className="pie-drill-title">{pieTitle}</span>
              </div>
              {hasPieData ? (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label={({ cx, cy, midAngle = 0, outerRadius, name, percent }) => {
                          const RADIAN = Math.PI / 180
                          const radius = outerRadius * 1.25
                          const x = cx + radius * Math.cos(-midAngle * RADIAN)
                          const y = cy + radius * Math.sin(-midAngle * RADIAN)
                          const textAnchor = x > cx ? 'start' : 'end'
                          return (
                            <text x={x} y={y} fill="var(--text-secondary)" textAnchor={textAnchor} dominantBaseline="central" fontSize={13}>
                              <tspan fontWeight={500}>{name}</tspan>
                              <tspan fill="var(--text-dim)" fontSize={12}> {((percent ?? 0) * 100).toFixed(0)}%</tspan>
                            </text>
                          )
                        }}
                        labelLine={{ stroke: 'var(--text-dim)', strokeWidth: 1, opacity: 0.5 }}
                        onClick={(_, index) => {
                          const item = pieData[index]
                          if (item.name === '其他') {
                            setDrillPath((p) => [...p, '__other__'])
                          } else {
                            setDrillPath((p) => [...p, item.name])
                          }
                        }}
                      >
                        {pieData.map((_, i) => {
                          const isOther = pieData[i].name === '其他'
                          return <Cell key={i} fill={isOther ? '#9ca3af' : CHART_COLORS[i % CHART_COLORS.length]} />
                        })}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pie-legend">
                    {pieLegendItems.map((item, i) => (
                      <div
                        key={item.name}
                        className="pie-legend-item"
                        onClick={() => {
                          if (item.name === '其他') {
                            setDrillPath((p) => [...p, '__other__'])
                          } else {
                            setDrillPath((p) => [...p, item.name])
                          }
                        }}
                      >
                        <span className="pie-legend-info">
                          <span className="pie-legend-dot" style={{ background: legendColor(i, item.name) }} />
                          <span className="pie-legend-name">{item.name}</span>
                          <span className="pie-legend-pct">{item.percent}%</span>
                        </span>
                        <span className="pie-legend-amount">¥{item.value.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="chart-placeholder">暂无分类数据</div>
              )}
            </div>
          )}

          {/* 堆叠柱状图 */}
          {chartType === 'bar' && (
            <div className="chart-section">
              <button className="chart-fullscreen-btn" onClick={() => setFullscreenChart('bar')} title="全屏">⛶</button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                {(barDrillL1 || barDrillL2) && (
                  <button className="stats-time-btn" onClick={() => {
                    if (barDrillL2) { setBarDrillL2(null) } else { setBarDrillL1(null) }
                  }}>
                    ← 返回
                  </button>
                )}
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>{barTitle}</span>
              </div>
              {barData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={barData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => `¥${Number(v).toFixed(2)}`} />
                      {barKeys.map((key, i) => (
                        <Bar key={key} dataKey={key} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', justifyContent: 'center', marginTop: 4 }}>
                    {barKeys.map((key, i) => (
                      <span
                        key={key}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
                          cursor: (!barDrillL2) ? 'pointer' : 'default',
                          padding: '2px 6px', borderRadius: 6, color: 'var(--text-secondary)',
                        }}
                        onClick={() => {
                          if (!barDrillL1) setBarDrillL1(key)
                          else if (!barDrillL2) setBarDrillL2(key)
                        }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: CHART_COLORS[i % CHART_COLORS.length], display: 'inline-block' }} />
                        {key}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <div className="chart-placeholder">暂无月度数据</div>
              )}
            </div>
          )}
        </>
      )}

      {/* 全屏图表 */}
      {fullscreenChart && (
        <div className="chart-fullscreen-overlay" onClick={() => setFullscreenChart(null)}>
          <div
            className={`chart-fullscreen-container ${fullscreenChart === 'bar' ? 'chart-fullscreen-landscape' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            {fullscreenChart === 'pie' && (
              <>
                <div className="pie-drill-header">
                  {drillPath.length > 0 && (
                    <button className="stats-time-btn" onClick={() => setDrillPath((p) => p.slice(0, -1))}>
                      ← 返回
                    </button>
                  )}
                  <span className="pie-drill-title">{pieTitle}</span>
                </div>
                {hasPieData ? (
                  <>
                    <ResponsiveContainer width="100%" height="55%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={130}
                          label={({ cx, cy, midAngle = 0, outerRadius, name, percent }) => {
                            const RADIAN = Math.PI / 180
                            const radius = outerRadius * 1.2
                            const x = cx + radius * Math.cos(-midAngle * RADIAN)
                            const y = cy + radius * Math.sin(-midAngle * RADIAN)
                            const textAnchor = x > cx ? 'start' : 'end'
                            return (
                              <text x={x} y={y} fill="var(--text-secondary)" textAnchor={textAnchor} dominantBaseline="central" fontSize={14}>
                                <tspan fontWeight={500}>{name}</tspan>
                                <tspan fill="var(--text-dim)" fontSize={13}> {((percent ?? 0) * 100).toFixed(0)}%</tspan>
                              </text>
                            )
                          }}
                          labelLine={{ stroke: 'var(--text-dim)', strokeWidth: 1, opacity: 0.5 }}
                          onClick={(_, index) => {
                            const item = pieData[index]
                            if (item.name === '其他') {
                              setDrillPath((p) => [...p, '__other__'])
                            } else {
                              setDrillPath((p) => [...p, item.name])
                            }
                          }}
                        >
                          {pieData.map((_, i) => {
                            const isOther = pieData[i].name === '其他'
                            return <Cell key={i} fill={isOther ? '#9ca3af' : CHART_COLORS[i % CHART_COLORS.length]} />
                          })}
                        </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pie-legend pie-legend--fs">
                      {pieLegendItems.map((item, i) => (
                        <div
                          key={item.name}
                          className="pie-legend-item"
                          onClick={() => {
                            if (item.name === '其他') {
                              setDrillPath((p) => [...p, '__other__'])
                            } else {
                              setDrillPath((p) => [...p, item.name])
                            }
                          }}
                        >
                          <span className="pie-legend-dot" style={{ background: legendColor(i, item.name) }} />
                          <span className="pie-legend-name">{item.name}</span>
                          <span className="pie-legend-pct">{item.percent}%</span>
                          <span className="pie-legend-amount">¥{item.value.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="chart-placeholder">暂无分类数据</div>
                )}
              </>
            )}
            {fullscreenChart === 'bar' && (
              barData.length > 0 ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexShrink: 0 }}>
                    {(barDrillL1 || barDrillL2) && (
                      <button className="stats-time-btn" onClick={() => {
                        if (barDrillL2) { setBarDrillL2(null) } else { setBarDrillL1(null) }
                      }}>
                        ← 返回
                      </button>
                    )}
                    <span style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 500 }}>{barTitle}</span>
                  </div>
                  <div className="chart-landscape-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barCategoryGap="8%" barGap={0} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tick={{ fontSize: 12 }} />
                        <YAxis type="category" dataKey="period" tick={{ fontSize: 12 }} width={70} />
                        <Tooltip formatter={(v) => `¥${Number(v).toFixed(2)}`} />
                        {barKeys.map((key, i) => (
                          <Bar key={key} dataKey={key} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="chart-landscape-legend">
                    {barKeys.map((key, i) => (
                      <div
                        key={key}
                        className="chart-landscape-legend-item"
                        style={{ cursor: (!barDrillL2) ? 'pointer' : 'default' }}
                        onClick={() => {
                          if (!barDrillL1) setBarDrillL1(key)
                          else if (!barDrillL2) setBarDrillL2(key)
                        }}
                      >
                        <span className="chart-landscape-legend-dot" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="chart-landscape-legend-name">{key}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="chart-placeholder">暂无月度数据</div>
              )
            )}
          </div>
          <button className="chart-fullscreen-close" onClick={() => setFullscreenChart(null)}>✕</button>
        </div>
      )}

      {/* ── 分类管理（可折叠） ── */}
      <div className="categories-section">
        <button
          className="categories-toggle"
          onClick={() => setShowCategories(!showCategories)}
        >
          {showCategories ? '收起分类管理 ▲' : '管理分类 ▼'}
        </button>

        {showCategories && (
          <div className="categories-body">
            {categories.length === 0 && (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-dim)', fontSize: 14 }}>
                还没有分类
              </div>
            )}
            {categories.map((cat) => (
              <CategoryNode
                key={cat.id}
                cat={cat}
                depth={0}
                onRefresh={refreshCategories}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
