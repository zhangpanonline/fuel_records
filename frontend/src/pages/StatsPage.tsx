import { useState, useEffect } from 'react'
import html2canvas from 'html2canvas'
import {
  fetchVehicles,
  fetchSummary,
  fetchMonthly,
  clearToken,
  type Vehicle,
  type SummaryStats,
  type MonthlyStats,
} from '../services/api'
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

const VEHICLE_KEY = 'fuel_records_vehicle_id'
const THEME_KEY = 'fuel_records_theme'

function getTheme(): string {
  return localStorage.getItem(THEME_KEY) || 'auto'
}

function applyTheme(theme: string) {
  if (theme === 'auto') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', theme)
  }
}

const MONTH_NAMES = [
  '', '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月',
]

function StatsPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null)
  const [summary, setSummary] = useState<SummaryStats | null>(null)
  const [monthly, setMonthly] = useState<MonthlyStats | null>(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [theme, setTheme] = useState(getTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    loadVehicles()
  }, [])

  useEffect(() => {
    if (selectedVehicleId !== null) {
      loadStats(selectedVehicleId, year)
    }
  }, [selectedVehicleId, year])

  async function loadVehicles() {
    try {
      const list = await fetchVehicles()
      setVehicles(list)
      const savedId = localStorage.getItem(VEHICLE_KEY)
      const saved = savedId ? Number(savedId) : null
      const exists = list.find((v) => v.id === saved)
      setSelectedVehicleId(exists ? saved! : list.length > 0 ? list[0].id : null)
      setLoading(false)
    } catch {
      setError('加载车辆列表失败')
      setLoading(false)
    }
  }

  async function loadStats(vehicleId: number, y: number) {
    setLoading(true)
    setError('')
    try {
      const [s, m] = await Promise.all([
        fetchSummary(vehicleId),
        fetchMonthly(vehicleId, y),
      ])
      setSummary(s)
      setMonthly(m)
    } catch {
      setError('加载统计数据失败')
    } finally {
      setLoading(false)
    }
  }

  function handleLogout() {
    clearToken()
    window.location.href = '/login'
  }

  function handleBack() {
    window.location.href = '/'
  }

  function handleToggleTheme() {
    const next: Record<string, string> = { auto: 'light', light: 'dark', dark: 'auto' }
    const newTheme = next[theme] || 'auto'
    setTheme(newTheme)
    localStorage.setItem(THEME_KEY, newTheme)
    applyTheme(newTheme)
  }

  async function handleScreenshot() {
    const el = document.getElementById('stats-content')
    if (!el) return
    try {
      const canvas = await html2canvas(el, {
        backgroundColor: null,
        scale: 2,
      })
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b)
          else reject(new Error('截图失败'))
        }, 'image/png')
      })

      // 尝试分享
      if (navigator.share && navigator.canShare) {
        const file = new File([blob], 'fuel_stats.png', { type: 'image/png' })
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: '油耗统计' })
          return
        }
      }

      // 回退：下载
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'fuel_stats.png'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      alert('截图失败，请重试')
    }
  }

  const chartData = monthly?.months.map((m) => ({
    name: MONTH_NAMES[m.month],
    month: m.month,
    平均油耗: m.avg_consumption ?? undefined,
    总花费: m.total_cost,
    加油次数: m.count,
  })) ?? []

  const currentVehicle = vehicles.find((v) => v.id === selectedVehicleId)

  return (
    <div className="app">
      <div className="header">
        <button className="logout-btn" onClick={handleBack}>
          ← 返回
        </button>
        <h1 className="title">数据统计</h1>
        <div className="header-actions">
          <button className="export-btn" onClick={handleScreenshot}>
            分享截图
          </button>
          <button className="theme-btn" onClick={handleToggleTheme}>
            {theme === 'auto' ? '🌓' : theme === 'dark' ? '🌙' : '☀️'}
          </button>
          <button className="logout-btn" onClick={handleLogout}>
            退出
          </button>
        </div>
      </div>

      {/* 车辆选择器 */}
      {vehicles.length > 0 && (
        <div className="vehicle-bar">
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

          {/* 年份选择器 */}
          <div className="year-selector animate-in">
            <label>年份：</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(
                (y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ),
              )}
            </select>
          </div>

          {/* 月度油耗趋势图 */}
          {chartData.length > 0 ? (
            <div className="chart-container animate-in stagger-1">
              <h3>月度油耗趋势</h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis
                    yAxisId="left"
                    label={{
                      value: '油耗 (L/100km)',
                      angle: -90,
                      position: 'insideLeft',
                      style: { fontSize: 12 },
                    }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    label={{
                      value: '花费 (元)',
                      angle: 90,
                      position: 'insideRight',
                      style: { fontSize: 12 },
                    }}
                  />
                  <Tooltip />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="平均油耗"
                    stroke="#4a90d9"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    connectNulls={false}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="总花费"
                    stroke="#e74c3c"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="chart-container animate-in stagger-1">
              <p className="status-text">{year} 年暂无数据</p>
            </div>
          )}

          {/* 月度明细表 */}
          {chartData.length > 0 && (
            <div className="chart-container animate-in stagger-2">
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
                  {chartData.map((m) => (
                    <tr key={m.month}>
                      <td>{m.name}</td>
                      <td>{m.加油次数}</td>
                      <td>
                        {monthly!.months.find((x) => x.month === m.month)
                          ?.total_volume.toFixed(2) ?? '-'}
                      </td>
                      <td>{m.总花费.toFixed(2)}</td>
                      <td>
                        {m.平均油耗 != null ? m.平均油耗.toFixed(2) : '-'}
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
