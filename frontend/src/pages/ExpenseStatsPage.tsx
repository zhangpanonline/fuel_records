import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  fetchExpenseStats,
  type BreakdownItem,
  type PeriodItem,
} from '../services/api'
import { useExpenseData } from '../context/ExpenseDataContext'
import { usePrediction } from '../context/PredictionContext'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  getLevelItems,
  computePieData,
  computeBarData,
  useDrilldown,
  type PieDatum,
} from '../hooks/useChartDrilldown'
import { CHART_COLORS } from '../components/chartConfig'
import PieChartPanel, {
  type LegendItem,
} from '../components/PieChartPanel'
import CategoryNode from '../components/CategoryNode'
import './ExpenseStatsPage.css'

/* ================================================================
   常量
   ================================================================ */
type ChartType = 'pie' | 'bar'

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
   ExpenseStatsPage — 记账统计全屏页
   ================================================================ */
export default function ExpenseStatsPage() {
  const { categories, refreshCategories } = useExpenseData()
  const prediction = usePrediction()
  const { updatePageState, pendingAction, consumePendingAction } = prediction

  // ── 下钻状态 ──
  const {
    drillPath,
    setDrillPath,
    barDrillL1,
    setBarDrillL1,
    barDrillL2,
    setBarDrillL2,
    resetDrill,
  } = useDrilldown()

  // ── 时间选择 ──
  const today = fmtDate(new Date())
  const [startDate, setStartDate] = useState(daysAgo(30))
  const [endDate, setEndDate] = useState(today)
  const [activePeriod, setActivePeriod] = useState<string>('month')
  const [chartType, setChartType] = useState<ChartType>('pie')
  const [loading, setLoading] = useState(true)
  const [fullscreenChart, setFullscreenChart] = useState<string | null>(null)
  const [showCategories, setShowCategories] = useState(false)
  const firstLoad = useRef(true)

  // ── 同步页面状态到预测引擎 ──
  useEffect(() => {
    const now = new Date()
    updatePageState({
      page: '/expense/stats',
      hasRecordsToday: false, // 统计页不需要这个字段，设为默认值
      chartType,
      isFullscreen: fullscreenChart !== null,
      hour: now.getHours(),
      dayOfWeek: now.getDay(),
    })
  }, [chartType, fullscreenChart, updatePageState])

  // ── 响应预测引擎下发的 Action ──
  useEffect(() => {
    if (!pendingAction) return

    if (pendingAction.type === 'switch_chart') {
      setChartType(pendingAction.chart)
      consumePendingAction()
    } else if (pendingAction.type === 'toggle_fullscreen') {
      setFullscreenChart((prev) => prev ? null : fullscreenChart || 'pie')
      consumePendingAction()
    } else if (pendingAction.type === 'scroll_to_top') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      consumePendingAction()
    }
  }, [pendingAction, consumePendingAction, fullscreenChart])

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

  /* ---- 数据获取 ---- */

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
    resetDrill()
    if (chartType === 'bar') {
      setMonthlyLoaded(false)
      loadMonthly()
    } else {
      setSummaryLoaded(false)
      loadSummary()
    }
  }, [startDate, endDate, chartType, loadSummary, loadMonthly, resetDrill])

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
    return () =>
      window.removeEventListener('close-chart-fullscreen', handleCloseFullscreen)
  }, [])

  // 全屏状态同步到 window，供 FAB 判断
  useEffect(() => {
    ;(window as any).__chartFullscreenActive = !!fullscreenChart
    return () => {
      ;(window as any).__chartFullscreenActive = false
    }
  }, [fullscreenChart])

  /* ---- 时段快捷选择 ---- */

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

  /* ---- 饼图数据（使用提取的计算函数） ---- */

  const pieData: PieDatum[] = useMemo(
    () => computePieData(summaryData?.category_breakdown, drillPath),
    [summaryData, drillPath],
  )

  const pieTitle = useMemo(() => {
    const { level, l1Name, l2Name } = getLevelItems(
      summaryData?.category_breakdown || [],
      drillPath,
    )
    const inOther = drillPath[drillPath.length - 1] === '__other__'
    let base = ''
    if (level === 1) base = '一级分类'
    else if (level === 2) base = l1Name
    else base = `${l1Name} / ${l2Name}`
    return inOther ? `${base} / 其他` : base
  }, [summaryData, drillPath])

  /* ---- 饼图图例 ---- */

  const pieLegendItems: LegendItem[] = useMemo(() => {
    const total = pieData.reduce((s, i) => s + i.value, 0)
    if (total === 0) return []
    return pieData.map((item, i) => ({
      name: item.name,
      value: item.value,
      percent: (item.value / total) * 100,
      color:
        item.name === '其他'
          ? '#9ca3af'
          : CHART_COLORS[i % CHART_COLORS.length],
    }))
  }, [pieData])

  /* ---- 饼图下钻回调 ---- */

  function handlePieDrill(name: string) {
    if (name === '其他') {
      setDrillPath((p) => [...p, '__other__'])
    } else {
      setDrillPath((p) => [...p, name])
    }
  }

  function handlePieBack() {
    setDrillPath((p) => p.slice(0, -1))
  }

  /* ---- 柱状图数据（使用提取的计算函数） ---- */

  const barData = useMemo(
    () => computeBarData(monthlyData, barDrillL1, barDrillL2),
    [monthlyData, barDrillL1, barDrillL2],
  )

  const barKeys = useMemo(() => {
    if (barData.length === 0) return []
    return Object.keys(barData[0]).filter((k) => k !== 'period')
  }, [barData])

  const barTitle = useMemo(() => {
    if (!barDrillL1) return '一级分类'
    if (!barDrillL2) return barDrillL1
    return `${barDrillL1} / ${barDrillL2}`
  }, [barDrillL1, barDrillL2])

  /* ---- 渲染 ---- */

  const hasPieData = pieData.length > 0

  return (
    <div className="expense-stats-page">
      {/* 日期范围选择 */}
      <div className="stats-date-row animate-in">
        <div className="stats-date-field">
          <input
            type="date"
            value={startDate}
            max={endDate}
            onChange={(e) => {
              setStartDate(e.target.value)
              setActivePeriod('')
            }}
          />
        </div>
        <span className="stats-date-sep">至</span>
        <div className="stats-date-field">
          <input
            type="date"
            value={endDate}
            min={startDate}
            max={today}
            onChange={(e) => {
              setEndDate(e.target.value)
              setActivePeriod('')
            }}
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
              <div className="stats-card-value">
                ¥{summaryData.total_amount.toFixed(2)}
              </div>
              <div className="stats-card-label">总支出</div>
            </div>
            <div className="stats-card">
              <div className="stats-card-value">
                {summaryData.record_count}
              </div>
              <div className="stats-card-label">笔数</div>
            </div>
            <div className="stats-card">
              <div className="stats-card-value">
                ¥{summaryData.avg_daily.toFixed(2)}
              </div>
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

          {/* 饼图（非全屏） */}
          {chartType === 'pie' && (
            <PieChartPanel
              pieData={pieData}
              pieLegendItems={pieLegendItems}
              pieTitle={pieTitle}
              drillPath={drillPath}
              hasPieData={hasPieData}
              fullscreen={false}
              onDrill={handlePieDrill}
              onBack={handlePieBack}
              onToggleFullscreen={() => setFullscreenChart('pie')}
            />
          )}

          {/* 堆叠柱状图 */}
          {chartType === 'bar' && (
            <div className="chart-section">
              <button
                className="chart-fullscreen-btn"
                onClick={() => setFullscreenChart('bar')}
                title="全屏"
              >
                ⛶
              </button>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                {(barDrillL1 || barDrillL2) && (
                  <button
                    className="stats-time-btn"
                    onClick={() => {
                      if (barDrillL2) {
                        setBarDrillL2(null)
                      } else {
                        setBarDrillL1(null)
                      }
                    }}
                  >
                    ← 返回
                  </button>
                )}
                <span
                  style={{
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                    fontWeight: 500,
                  }}
                >
                  {barTitle}
                </span>
              </div>
              {barData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={barData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(v) => `¥${Number(v).toFixed(2)}`}
                      />
                      {barKeys.map((key, i) => (
                        <Bar
                          key={key}
                          dataKey={key}
                          stackId="a"
                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                  {/* 柱状图图例（支持下钻） */}
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '4px 12px',
                      justifyContent: 'center',
                      marginTop: 4,
                    }}
                  >
                    {barKeys.map((key, i) => (
                      <span
                        key={key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 11,
                          cursor: !barDrillL2 ? 'pointer' : 'default',
                          padding: '2px 6px',
                          borderRadius: 6,
                          color: 'var(--text-secondary)',
                        }}
                        onClick={() => {
                          if (!barDrillL1) setBarDrillL1(key)
                          else if (!barDrillL2) setBarDrillL2(key)
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            background:
                              CHART_COLORS[i % CHART_COLORS.length],
                            display: 'inline-block',
                          }}
                        />
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
        <div
          className="chart-fullscreen-overlay"
          onClick={() => setFullscreenChart(null)}
        >
          <div
            className={`chart-fullscreen-container ${fullscreenChart === 'bar' ? 'chart-fullscreen-landscape' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            {fullscreenChart === 'pie' && (
              <PieChartPanel
                pieData={pieData}
                pieLegendItems={pieLegendItems}
                pieTitle={pieTitle}
                drillPath={drillPath}
                hasPieData={hasPieData}
                fullscreen={true}
                onDrill={handlePieDrill}
                onBack={handlePieBack}
              />
            )}
            {fullscreenChart === 'bar' &&
              (barData.length > 0 ? (
                <>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 8,
                      flexShrink: 0,
                    }}
                  >
                    {(barDrillL1 || barDrillL2) && (
                      <button
                        className="stats-time-btn"
                        onClick={() => {
                          if (barDrillL2) {
                            setBarDrillL2(null)
                          } else {
                            setBarDrillL1(null)
                          }
                        }}
                      >
                        ← 返回
                      </button>
                    )}
                    <span
                      style={{
                        fontSize: 14,
                        color: 'var(--text-secondary)',
                        fontWeight: 500,
                      }}
                    >
                      {barTitle}
                    </span>
                  </div>
                  <div className="chart-landscape-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={barData}
                        margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                        barCategoryGap="8%"
                        barGap={0}
                        layout="vertical"
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tick={{ fontSize: 12 }} />
                        <YAxis
                          type="category"
                          dataKey="period"
                          tick={{ fontSize: 12 }}
                          width={70}
                        />
                        <Tooltip
                          formatter={(v) => `¥${Number(v).toFixed(2)}`}
                        />
                        {barKeys.map((key, i) => (
                          <Bar
                            key={key}
                            dataKey={key}
                            stackId="a"
                            fill={CHART_COLORS[i % CHART_COLORS.length]}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="chart-landscape-legend">
                    {barKeys.map((key, i) => (
                      <div
                        key={key}
                        className="chart-landscape-legend-item"
                        style={{
                          cursor: !barDrillL2 ? 'pointer' : 'default',
                        }}
                        onClick={() => {
                          if (!barDrillL1) setBarDrillL1(key)
                          else if (!barDrillL2) setBarDrillL2(key)
                        }}
                      >
                        <span
                          className="chart-landscape-legend-dot"
                          style={{
                            background:
                              CHART_COLORS[i % CHART_COLORS.length],
                          }}
                        />
                        <span className="chart-landscape-legend-name">
                          {key}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="chart-placeholder">暂无月度数据</div>
              ))}
          </div>
          <button
            className="chart-fullscreen-close"
            onClick={() => setFullscreenChart(null)}
          >
            ✕
          </button>
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
              <div
                style={{
                  textAlign: 'center',
                  padding: 20,
                  color: 'var(--text-dim)',
                  fontSize: 14,
                }}
              >
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
