import { useState, useEffect, useMemo, useCallback } from 'react'
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
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import './ExpenseStatsPage.css'

/* ================================================================
   常量
   ================================================================ */
type ChartType = 'pie' | 'bar' | 'sunburst'

const CHART_COLORS = [
  '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
  '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#6e7074',
]

/* ================================================================
   CategoryNode — 可展开分类节点
   ================================================================ */
function CategoryNode({
  cat,
  depth,
  onRefresh,
}: {
  cat: ExpenseCategory
  depth: number
  onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState(depth < 2)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(cat.name)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  async function handleSaveEdit() {
    if (!editName.trim() || editName === cat.name) {
      setEditing(false)
      return
    }
    try {
      await updateCategory(cat.id, { name: editName.trim() })
      setEditing(false)
      onRefresh()
    } catch (err: unknown) {
      let msg = '修改失败'
      if (axios.isAxiosError(err) && err.response?.data?.detail) msg = err.response.data.detail
      alert(msg)
    }
  }

  async function handleAddChild() {
    if (!newName.trim()) return
    try {
      await createCategory({ name: newName.trim(), parent_id: cat.id })
      setAdding(false)
      setNewName('')
      onRefresh()
    } catch (err: unknown) {
      let msg = '创建失败'
      if (axios.isAxiosError(err) && err.response?.data?.detail) msg = err.response.data.detail
      alert(msg)
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

  const canAddChild = cat.level < 3

  return (
    <div className="category-node">
      <div className="category-node-header">
        <span className="category-node-expand" onClick={() => setExpanded(!expanded)}>
          {cat.children.length > 0 ? (expanded ? '▼' : '▶') : '  '}
        </span>
        {editing ? (
          <div className="inline-edit">
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveEdit()
                if (e.key === 'Escape') setEditing(false)
              }}
              autoFocus
            />
            <button className="inline-edit-save" onClick={handleSaveEdit}>保存</button>
            <button className="inline-edit-cancel" onClick={() => setEditing(false)}>取消</button>
          </div>
        ) : (
          <>
            <span className="category-node-name">{cat.name}</span>
            <div className="category-node-actions">
              <button onClick={() => { setEditName(cat.name); setEditing(true) }}>重命名</button>
              <button onClick={handleDelete}>删除</button>
            </div>
          </>
        )}
      </div>
      {expanded && (
        <div className="category-children">
          {cat.children.map((child) => (
            <CategoryNode key={child.id} cat={child} depth={depth + 1} onRefresh={onRefresh} />
          ))}
          {adding && (
            <div className="inline-edit">
              <input
                placeholder="子分类名称"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddChild()
                  if (e.key === 'Escape') setAdding(false)
                }}
                autoFocus
              />
              <button className="inline-edit-save" onClick={handleAddChild}>添加</button>
              <button className="inline-edit-cancel" onClick={() => setAdding(false)}>取消</button>
            </div>
          )}
          {canAddChild && !adding && (
            <button className="add-category-btn" onClick={() => setAdding(true)}>
              + 添加子分类
            </button>
          )}
        </div>
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
  const [period, setPeriod] = useState('month')
  const [chartType, setChartType] = useState<ChartType>('pie')
  const [loading, setLoading] = useState(true)

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

  // ── 饼图下钻 ──
  const [drillL1, setDrillL1] = useState<string | null>(null)
  const [drillL2, setDrillL2] = useState<string | null>(null)

  // ── 分类管理 ──
  const [showCategories, setShowCategories] = useState(false)
  const [addingRoot, setAddingRoot] = useState(false)
  const [newRootName, setNewRootName] = useState('')

  const getDateRange = useCallback((p: string): [string, string] => {
    const now = new Date()
    const end = now.toISOString().slice(0, 10)
    let start: string
    if (p === 'month') {
      start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    } else if (p === 'year') {
      start = `${now.getFullYear()}-01-01`
    } else {
      const d = new Date(now)
      d.setDate(d.getDate() - 7)
      start = d.toISOString().slice(0, 10)
    }
    return [start, end]
  }, [])

  const loadSummary = useCallback(async () => {
    try {
      const [start, end] = getDateRange(period)
      const stats = await fetchExpenseStats(start, end, 'none')
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
  }, [period, getDateRange])

  const loadMonthly = useCallback(async () => {
    try {
      const [start, end] = getDateRange(period)
      const stats = await fetchExpenseStats(start, end, 'month')
      setMonthlyData(stats.items || [])
      setMonthlyLoaded(true)
    } catch {
      setMonthlyData(null)
      setMonthlyLoaded(true)
    }
  }, [period, getDateRange])

  useEffect(() => {
    setLoading(true)
    setDrillL1(null)
    setDrillL2(null)
    if (chartType === 'bar') {
      setMonthlyLoaded(false)
      loadMonthly()
    } else {
      setSummaryLoaded(false)
      loadSummary()
    }
  }, [period, chartType, loadSummary, loadMonthly])

  useEffect(() => {
    if (chartType === 'bar' ? monthlyLoaded : summaryLoaded) {
      setLoading(false)
    }
  }, [summaryLoaded, monthlyLoaded, chartType])

  useEffect(() => {
    if (showCategories) {
      refreshCategories()
    }
  }, [showCategories, refreshCategories])

  async function handleAddRoot() {
    if (!newRootName.trim()) return
    try {
      await createCategory({ name: newRootName.trim() })
      setNewRootName('')
      setAddingRoot(false)
      await refreshCategories()
    } catch (err: unknown) {
      let msg = '创建失败'
      if (axios.isAxiosError(err) && err.response?.data?.detail) msg = err.response.data.detail
      alert(msg)
    }
  }

  const periods = [
    { key: 'month', label: '本月' },
    { key: 'year', label: '本年' },
    { key: 'week', label: '近一周' },
  ]

  const chartTypes: { key: ChartType; label: string }[] = [
    { key: 'pie', label: '饼图' },
    { key: 'bar', label: '柱状图' },
    { key: 'sunburst', label: '旭日图' },
  ]

  // ── 饼图下钻数据 ──
  const pieData = useMemo(() => {
    const breakdown = summaryData?.category_breakdown || []
    if (!drillL1 && !drillL2) {
      return breakdown
        .filter((b) => b.category_l2 === null && b.category_l3 === null)
        .map((b) => ({ name: b.category_l1 || '未分类', value: Number(b.total) }))
    }
    if (drillL1 && !drillL2) {
      return breakdown
        .filter((b) => b.category_l1 === drillL1 && b.category_l2 !== null && b.category_l3 === null)
        .map((b) => ({ name: b.category_l2 || '', value: Number(b.total) }))
    }
    if (drillL1 && drillL2) {
      return breakdown
        .filter((b) => b.category_l1 === drillL1 && b.category_l2 === drillL2 && b.category_l3 !== null)
        .map((b) => ({ name: b.category_l3 || '', value: Number(b.total) }))
    }
    return []
  }, [summaryData, drillL1, drillL2])

  const pieTitle = drillL1
    ? drillL2 ? `${drillL1} / ${drillL2}` : drillL1
    : '一级分类'

  // ── 堆叠柱状图数据 ──
  const barData = useMemo(() => {
    if (!monthlyData) return []
    const l1Set = new Set<string>()
    monthlyData.forEach((p) => {
      p.breakdown
        .filter((b) => b.category_l2 === null && b.category_l3 === null && b.category_l1)
        .forEach((b) => l1Set.add(b.category_l1!))
    })
    const l1List = Array.from(l1Set)
    return monthlyData.map((p) => {
      const row: Record<string, number | string> = { period: p.period }
      const l1Totals: Record<string, number> = {}
      p.breakdown
        .filter((b) => b.category_l2 === null && b.category_l3 === null && b.category_l1)
        .forEach((b) => { l1Totals[b.category_l1!] = Number(b.total) })
      l1List.forEach((l1) => { row[l1] = l1Totals[l1] || 0 })
      return row
    })
  }, [monthlyData])

  // ── 旭日图数据 ──
  const sunburstData = useMemo(() => {
    const breakdown = summaryData?.category_breakdown || []
    return breakdown
      .filter((b) => b.category_l2 === null && b.category_l3 === null)
      .map((b) => ({ name: b.category_l1 || '未分类', value: Number(b.total) }))
  }, [summaryData])

  const hasPieData = pieData.length > 0

  return (
    <div className="expense-stats-page">
      {/* 时间快捷选择 */}
      <div className="stats-time-row">
        {periods.map((p) => (
          <button
            key={p.key}
            className={`stats-time-btn ${period === p.key ? 'active' : ''}`}
            onClick={() => setPeriod(p.key)}
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
                  if (ct.key !== 'bar') {
                    setDrillL1(null)
                    setDrillL2(null)
                  }
                }}
              >
                {ct.label}
              </button>
            ))}
          </div>

          {/* 饼图下钻 */}
          {chartType === 'pie' && (
            <div style={{ marginTop: 12 }}>
              <div className="pie-drill-header">
                {drillL1 && (
                  <button
                    className="stats-time-btn"
                    onClick={() => drillL2 ? setDrillL2(null) : setDrillL1(null)}
                  >
                    ← 返回
                  </button>
                )}
                <span className="pie-drill-title">{pieTitle}</span>
              </div>
              {hasPieData ? (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={({ name, percent }) =>
                        `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                      }
                      onClick={(_, index) => {
                        const item = pieData[index]
                        if (!drillL1) {
                          setDrillL1(item.name)
                        } else if (!drillL2) {
                          setDrillL2(item.name)
                        }
                      }}
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => `¥${Number(v).toFixed(2)}`} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-placeholder">暂无分类数据</div>
              )}
            </div>
          )}

          {/* 堆叠柱状图 */}
          {chartType === 'bar' && (
            <div style={{ marginTop: 12 }}>
              {barData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => `¥${Number(v).toFixed(2)}`} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {Object.keys(barData[0] || {})
                      .filter((k) => k !== 'period')
                      .map((l1, i) => (
                        <Bar key={l1} dataKey={l1} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-placeholder">暂无月度数据</div>
              )}
            </div>
          )}

          {/* 旭日图 */}
          {chartType === 'sunburst' && (
            <div style={{ marginTop: 12 }}>
              {sunburstData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={sunburstData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={35}
                      outerRadius={90}
                      label={({ name, percent }) =>
                        `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                      }
                    >
                      {sunburstData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => `¥${Number(v).toFixed(2)}`} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-placeholder">暂无层级数据</div>
              )}
            </div>
          )}
        </>
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
              <CategoryNode key={cat.id} cat={cat} depth={0} onRefresh={refreshCategories} />
            ))}

            {addingRoot ? (
              <div className="inline-edit" style={{ marginTop: 12 }}>
                <input
                  placeholder="一级分类名称"
                  value={newRootName}
                  onChange={(e) => setNewRootName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddRoot()
                    if (e.key === 'Escape') setAddingRoot(false)
                  }}
                  autoFocus
                />
                <button className="inline-edit-save" onClick={handleAddRoot}>添加</button>
                <button className="inline-edit-cancel" onClick={() => setAddingRoot(false)}>取消</button>
              </div>
            ) : (
              <button
                className="add-category-btn"
                onClick={() => { setAddingRoot(true); setNewRootName('') }}
              >
                + 添加一级分类
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
