import { useState, useEffect, useMemo, useRef } from 'react'
import {
  fetchSummary,
  fetchTimeline,
  fetchMonthly,
  type SummaryStats,
  type TimelineStats,
  type MonthlyStats,
  type TimelineItem,
} from '../services/api'
import { useFuelData } from '../context/FuelDataContext'
import { usePrediction } from '../context/PredictionContext'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import './StatsPage.css'

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

function daysBetween(a: string, b: string): number {
  return Math.ceil(Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

function fmtMonth(period: string): string {
  const parts = period.split('-')
  return `${parseInt(parts[1])}月`
}

/** 补齐日期范围内缺失的 periodo，确保曲线连续 */
function fillGaps(
  items: TimelineItem[],
  groupBy: string,
  start: string,
  end: string,
): TimelineItem[] {
  const map = new Map(items.map((i) => [i.period, i]))
  const result: TimelineItem[] = []
  const emptyItem = (period: string): TimelineItem => ({
    period,
    count: 0,
    total_volume: 0,
    total_cost: 0,
    avg_consumption: null,
  })

  const cur = new Date(start + 'T00:00:00')
  const endDate = new Date(end + 'T00:00:00')

  if (groupBy === 'day') {
    while (cur <= endDate) {
      const period = fmtDate(cur)
      result.push(map.get(period) ?? emptyItem(period))
      cur.setDate(cur.getDate() + 1)
    }
  } else if (groupBy === 'week') {
    while (cur <= endDate) {
      const weekEnd = new Date(cur)
      weekEnd.setDate(weekEnd.getDate() + 6)
      // 不截断，与后端 _group_by_week 的 period 格式完全一致
      const period = `${fmtDate(cur).slice(5)}~${fmtDate(weekEnd).slice(5)}`
      result.push(map.get(period) ?? emptyItem(period))
      cur.setDate(cur.getDate() + 7)
    }
  } else {
    let y = cur.getFullYear()
    let m = cur.getMonth() + 1
    const ey = endDate.getFullYear()
    const em = endDate.getMonth() + 1
    while (y < ey || (y === ey && m <= em)) {
      const period = `${y}-${String(m).padStart(2, '0')}`
      result.push(map.get(period) ?? emptyItem(period))
      m++
      if (m > 12) { m = 1; y++ }
    }
  }

  return result
}

const PERIODS = [
  { key: 'year', label: '近一年', days: 365 },
  { key: 'month', label: '近一月', days: 30 },
  { key: 'week', label: '近一周', days: 7 },
] as const

const GROUP_LABELS: Record<string, string> = {
  day: '每日油耗趋势',
  week: '每周油耗趋势',
  month: '月度油耗趋势',
}

function StatsPage() {
  const { vehicles, selectedVehicleId, setSelectedVehicleId } = useFuelData()
  const prediction = usePrediction()
  const { updatePageState } = prediction
  const [summary, setSummary] = useState<SummaryStats | null>(null)
  const [timeline, setTimeline] = useState<TimelineStats | null>(null)
  const [monthly, setMonthly] = useState<MonthlyStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const firstLoad = useRef(true)

  // ── 同步页面状态到预测引擎 ──
  useEffect(() => {
    const now = new Date()
    updatePageState({
      page: '/fuel/stats',
      hasRecordsToday: false,
      isFullscreen: false,
      hour: now.getHours(),
      dayOfWeek: now.getDay(),
    })
  }, [updatePageState])

  const today = fmtDate(new Date())
  const [startDate, setStartDate] = useState(daysAgo(30))
  const [endDate, setEndDate] = useState(today)
  const [activePeriod, setActivePeriod] = useState<string>('month')

  // 根据日期跨度自动选择聚合粒度
  const groupBy = useMemo(() => {
    const span = daysBetween(startDate, endDate)
    if (span <= 14) return 'day'
    if (span <= 90) return 'week'
    return 'month'
  }, [startDate, endDate])

  const chartTitle = GROUP_LABELS[groupBy] || '油耗趋势'

  // 当车辆或日期范围变化时，自动查询
  useEffect(() => {
    if (selectedVehicleId !== null && startDate && endDate) {
      loadStats(selectedVehicleId, startDate, endDate)
    }
  }, [selectedVehicleId, startDate, endDate])

  function selectPeriod(days: number, key: string) {
    const end = fmtDate(new Date())
    const start = daysAgo(days)
    setStartDate(start)
    setEndDate(end)
    setActivePeriod(key)
  }

  async function loadStats(vehicleId: number, start: string, end: string) {
    // 首次加载显示 loading，后续切换只更新数据不隐藏卡片
    if (firstLoad.current) {
      setLoading(true)
    }
    setError('')
    try {
      const gb = daysBetween(start, end) <= 14 ? 'day' : daysBetween(start, end) <= 90 ? 'week' : 'month'
      const [s, t, m] = await Promise.all([
        fetchSummary(vehicleId, start, end),
        fetchTimeline(vehicleId, gb, start, end),
        fetchMonthly(vehicleId, start, end),
      ])
      setSummary(s)
      setTimeline(t)
      setMonthly(m)
      firstLoad.current = false
    } catch (err: unknown) {
      console.error('Stats load failed:', err)
      let msg = '加载统计数据失败'
      if (err instanceof Error) msg = err.message
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const chartData = useMemo(
    () => {
      if (!timeline) return []
      const filled = fillGaps(timeline.items, groupBy, startDate, endDate)
      return filled.map((item) => ({
        period: item.period,
        平均油耗: item.avg_consumption ?? undefined,
        总花费: item.total_cost,
        加油次数: item.count,
      }))
    },
    [timeline, groupBy, startDate, endDate],
  )

  const currentVehicle = vehicles.find((v) => v.id === selectedVehicleId)

  return (
    <div className="stats-page">
      {/* 车辆选择器 */}
      {vehicles.length > 0 && (
        <div className="vehicle-bar animate-in">
          <select
            className="vehicle-select"
            value={selectedVehicleId ?? ''}
            onChange={(e) => setSelectedVehicleId(Number(e.target.value))}
          >
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.plate ? ` (${v.plate})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 日期范围选择 */}
      <div className="stats-date-row animate-in stagger-1">
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

      {loading && <p className="status-text">加载中...</p>}
      {error && <p className="status-text error">{error}</p>}

      {!loading && !error && summary && (
        <div id="stats-content">
          {/* 概览卡片 */}
          <div className="stats-cards">
            <div className="stat-card">
              <div className="stat-value">{summary.total_mileage.toFixed(0)}</div>
              <div className="stat-label">总里程 (km)</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">
                {summary.avg_consumption != null
                  ? summary.avg_consumption.toFixed(2)
                  : '-'}
              </div>
              <div className="stat-label">平均油耗</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{summary.total_fuel_cost.toFixed(0)}</div>
              <div className="stat-label">总花费 (元)</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{summary.total_fuel_volume.toFixed(1)}</div>
              <div className="stat-label">总加油量 (L)</div>
            </div>
          </div>

          {/* 趋势图 */}
          {chartData.length > 0 ? (
            <div className="chart-card animate-in stagger-1">
              <h3>{chartTitle}</h3>
              {/* Y 轴标签行：水平排列在图表上方 */}
              <div className="chart-axis-labels">
                <span className="axis-label-left">油耗 (L/100km)</span>
                <span className="axis-label-right">花费 (元)</span>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData} margin={{ top: 5, right: 0, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="period"
                    tick={{ fontSize: 11 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis yAxisId="left" width={35} />
                  <YAxis yAxisId="right" orientation="right" width={50} />
                  <Tooltip />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="平均油耗"
                    stroke="#4a90d9"
                    strokeWidth={2}
                    dot={(props: { value?: number | null; cx?: number; cy?: number; stroke?: string }) => {
                      if (props.value == null) return null
                      return <circle cx={props.cx} cy={props.cy} r={4} fill="#4a90d9" stroke="none" />
                    }}
                    connectNulls={true}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="总花费"
                    stroke="#e74c3c"
                    strokeWidth={2}
                    dot={(props: { value?: number; cx?: number; cy?: number; stroke?: string }) => {
                      if (props.value == null || props.value === 0) return null
                      return <circle cx={props.cx} cy={props.cy} r={4} fill="#e74c3c" stroke="none" />
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="chart-card animate-in stagger-1">
              <p className="status-text">所选时间段暂无数据</p>
            </div>
          )}

          {/* 明细表 */}
          {monthly && monthly.months.length > 0 && (
            <div className="chart-card animate-in stagger-2">
              <h3>月度明细</h3>
              <table className="monthly-table">
                <thead>
                  <tr>
                    <th>月份</th>
                    <th>次数</th>
                    <th>总油量(L)</th>
                    <th>总花费(元)</th>
                    <th>平均油耗</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.months.map((item) => (
                    <tr key={item.period}>
                      <td>{fmtMonth(item.period)}</td>
                      <td>{item.count}</td>
                      <td>{item.total_volume.toFixed(2)}</td>
                      <td>{item.total_cost.toFixed(2)}</td>
                      <td>
                        {item.avg_consumption != null
                          ? item.avg_consumption.toFixed(2)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!loading && !error && summary?.record_count === 0 && (
        <section className="records-section animate-in">
          <p className="status-text empty">
            {currentVehicle
              ? `${currentVehicle.name} 还没有加油记录`
              : '还没有加油记录'}
          </p>
        </section>
      )}
    </div>
  )
}

export default StatsPage
