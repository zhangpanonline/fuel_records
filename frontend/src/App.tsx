import { useState, useEffect, useMemo, useCallback, useRef, type FormEvent } from 'react'
import axios from 'axios'
import {
  createRecord,
  updateRecord,
  deleteRecord,
  createVehicle,
  fetchSummary,
  type FuelRecord,
  type SummaryStats,
} from './services/api'
import { checkUpdate, type UpdateInfo } from './services/upgrade'
import UpgradeModal from './components/UpgradeModal'
import { useFuelData } from './context/FuelDataContext'
import PullToRefresh from './components/PullToRefresh'
import FuelPageSkeleton from './components/FuelPageSkeleton'
import './App.css'

function App() {
  const {
    vehicles,
    selectedVehicleId,
    setSelectedVehicleId,
    records,
    total,
    page,
    loading,
    error,
    filters,
    setFilterStartDate,
    setFilterEndDate,
    setFilterFullTank,
    setFilterNote,
    showFilter,
    setShowFilter,
    showAddVehicle,
    setShowAddVehicle,
    loadRecords,
    refreshRecords,
    addVehicle,
  } = useFuelData()

  // ---- 表单状态 ----
  const [mileage, setMileage] = useState('')
  const [fuelVolume, setFuelVolume] = useState('')
  const [fuelCost, setFuelCost] = useState('')
  const [isFullTank, setIsFullTank] = useState(true)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  // ---- 添加车辆表单 ----
  const [newVehicleName, setNewVehicleName] = useState('')
  const [newVehiclePlate, setNewVehiclePlate] = useState('')
  const [newVehicleMileage, setNewVehicleMileage] = useState('')

  // ---- 累计统计下拉 ----
  type SummaryMode = 'since_last_month' | 'year' | 'month'
  const SUMMARY_MODE_KEY = 'fuel_summary_mode'
  const [summaryMode, setSummaryMode] = useState<SummaryMode>(() => {
    const saved = localStorage.getItem(SUMMARY_MODE_KEY)
    if (saved === 'year' || saved === 'month' || saved === 'since_last_month') return saved
    return 'since_last_month'
  })
  const [allSummaries, setAllSummaries] = useState<Record<SummaryMode, SummaryStats | null>>({
    year: null,
    month: null,
    since_last_month: null,
  })
  const [summaryDropdownOpen, setSummaryDropdownOpen] = useState(false)
  const summaryRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭下拉
  useEffect(() => {
    if (!summaryDropdownOpen) return
    function handleClick(e: MouseEvent) {
      if (summaryRef.current && !summaryRef.current.contains(e.target as Node)) {
        setSummaryDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [summaryDropdownOpen])

  function getDateRange(mode: SummaryMode): { startDate: string; endDate: string } {
    const today = new Date()
    const todayStr = fmtDateStr(today)
    if (mode === 'year') {
      return { startDate: `${today.getFullYear()}-01-01`, endDate: todayStr }
    }
    if (mode === 'month') {
      const m = String(today.getMonth() + 1).padStart(2, '0')
      return { startDate: `${today.getFullYear()}-${m}-01`, endDate: todayStr }
    }
    // since_last_month: (上月今天, 今天]
    const y = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear()
    const lm = today.getMonth() === 0 ? 11 : today.getMonth() - 1
    const lastDay = new Date(y, lm + 1, 0).getDate()
    const targetDay = Math.min(today.getDate(), lastDay)
    const lastMonthToday = new Date(y, lm, targetDay)
    lastMonthToday.setDate(lastMonthToday.getDate() + 1) // +1 for exclusive
    return { startDate: fmtDateStr(lastMonthToday), endDate: todayStr }
  }

  function fmtDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  const fetchAllSummaries = useCallback(async (vehicleId: number) => {
    const modes: SummaryMode[] = ['year', 'month', 'since_last_month']
    const results = await Promise.all(
      modes.map(async (mode) => {
        try {
          const { startDate, endDate } = getDateRange(mode)
          const data = await fetchSummary(vehicleId, startDate, endDate)
          return { mode, data }
        } catch {
          return { mode, data: null }
        }
      })
    )
    const map = {} as Record<SummaryMode, SummaryStats | null>
    results.forEach(({ mode, data }) => { map[mode] = data })
    setAllSummaries(map)
  }, [])

  useEffect(() => {
    if (selectedVehicleId !== null) {
      fetchAllSummaries(selectedVehicleId)
    } else {
      setAllSummaries({ year: null, month: null, since_last_month: null })
    }
  }, [selectedVehicleId, fetchAllSummaries])

  // ── 首次加载追踪 ──
  const firstLoadDone = useRef(false)
  if (!loading && !firstLoadDone.current) {
    firstLoadDone.current = true
  }
  const showSkeleton = loading && !firstLoadDone.current

  const handlePullRefresh = useCallback(async () => {
    if (selectedVehicleId !== null) {
      await loadRecords(selectedVehicleId, 1)
      fetchAllSummaries(selectedVehicleId)
    }
  }, [selectedVehicleId, loadRecords, fetchAllSummaries])

  function formatSummaryLabel(mode: SummaryMode): string {
    const d = allSummaries[mode]
    if (!d) {
      const labels: Record<SummaryMode, string> = {
        year: '当年累计油耗/当年累计金额',
        month: '当月累计油耗/当月累计金额',
        since_last_month: '自上月累计油耗/自上月累计金额',
      }
      return labels[mode]
    }
    return `${d.total_fuel_volume.toFixed(2)}L / ${d.total_fuel_cost.toFixed(2)}¥`
  }

  function formatSummaryOptionLabel(mode: SummaryMode): string {
    const d = allSummaries[mode]
    const prefix: Record<SummaryMode, string> = {
      year: '当年',
      month: '当月',
      since_last_month: '自上月',
    }
    if (!d) return `${prefix[mode]}累计油耗/累计金额`
    return `${prefix[mode]}油耗${d.total_fuel_volume.toFixed(2)}L / ${prefix[mode]}金额${d.total_fuel_cost.toFixed(2)}¥`
  }

  function handleSummarySelect(mode: SummaryMode) {
    setSummaryMode(mode)
    localStorage.setItem(SUMMARY_MODE_KEY, mode)
    setSummaryDropdownOpen(false)
  }

  function refreshSummaries() {
    if (selectedVehicleId !== null) {
      fetchAllSummaries(selectedVehicleId)
    }
  }

  // ---- 版本更新 ----
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)

  // 历史备注联想
  const noteSuggestions = useMemo(() => {
    const seen = new Set<string>()
    const result: string[] = []
    for (const r of records) {
      if (r.note && !seen.has(r.note)) {
        seen.add(r.note)
        result.push(r.note)
      }
    }
    return result
  }, [records])

  function handleApplyFilter() {
    refreshRecords()
    setShowFilter(false)
  }

  function handleClearFilter() {
    setFilterStartDate('')
    setFilterEndDate('')
    setFilterFullTank(undefined)
    setFilterNote('')
    refreshRecords()
    setShowFilter(false)
  }

  function handleLoadMore() {
    if (selectedVehicleId !== null) {
      loadRecords(selectedVehicleId, page + 1)
    }
  }

  async function handleAddVehicle(e: FormEvent) {
    e.preventDefault()
    if (!newVehicleName.trim() || !newVehicleMileage) {
      alert('请填写车辆名称和初始里程')
      return
    }
    try {
      const v = await createVehicle({
        name: newVehicleName.trim(),
        plate: newVehiclePlate.trim() || undefined,
        initial_mileage: Number(newVehicleMileage),
      })
      addVehicle(v)
      setNewVehicleName('')
      setNewVehiclePlate('')
      setNewVehicleMileage('')
      setShowAddVehicle(false)
      setSelectedVehicleId(v.id)
    } catch (err: unknown) {
      console.error('添加车辆失败:', err)
      alert('操作失败，请稍后重试')
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    if (selectedVehicleId === null) {
      alert('请先添加一辆车')
      return
    }

    const km = Number(mileage)
    const vol = Number(fuelVolume)
    const cost = Number(fuelCost)
    if (!km || !vol || !cost) {
      alert('请填写完整的加油数据（里程、油量、金额）')
      return
    }

    setSubmitting(true)
    try {
      if (editingId !== null) {
        await updateRecord(editingId, {
          mileage: km,
          fuel_volume: vol,
          fuel_cost: cost,
          is_full_tank: isFullTank,
          note: note || undefined,
        })
      } else {
        await createRecord({
          vehicle_id: selectedVehicleId,
          mileage: km,
          fuel_volume: vol,
          fuel_cost: cost,
          is_full_tank: isFullTank,
          note: note || undefined,
        })
      }
      setMileage('')
      setFuelVolume('')
      setFuelCost('')
      setIsFullTank(true)
      setNote('')
      setEditingId(null)
      await refreshRecords()
      refreshSummaries()
    } catch (err: unknown) {
      console.error('提交失败:', err)
      alert('操作失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm('确定要删除这条加油记录吗？')) return
    try {
      await deleteRecord(id)
      await refreshRecords()
      refreshSummaries()
    } catch (err: unknown) {
      console.error('删除失败:', err)
      alert('操作失败，请稍后重试')
    }
  }

  function handleEdit(record: FuelRecord) {
    setEditingId(record.id)
    setMileage(record.mileage.toString())
    setFuelVolume(record.fuel_volume.toString())
    setFuelCost(record.fuel_cost.toString())
    setIsFullTank(record.is_full_tank)
    setNote(record.note || '')
  }

  function handleCancelEdit() {
    setEditingId(null)
    setMileage('')
    setFuelVolume('')
    setFuelCost('')
    setIsFullTank(true)
    setNote('')
  }

  // 版本检测（启动时执行一次）
  useEffect(() => {
    checkUpdate().then((info) => {
      if (info) setUpdateInfo(info)
    })
  }, [])

  function formatDate(iso: string) {
    const d = new Date(iso)
    return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  const currentVehicle = vehicles.find((v) => v.id === selectedVehicleId)

  if (showSkeleton) {
    return <FuelPageSkeleton />
  }

  return (
    <PullToRefresh onRefresh={handlePullRefresh} skeleton={<FuelPageSkeleton />}>
      <div className="app">
      {/* 版本更新弹窗 */}
      {updateInfo && (
        <UpgradeModal
          updateInfo={updateInfo}
          currentVersion={import.meta.env.VITE_APP_VERSION || '1.0.0'}
          onClose={() => setUpdateInfo(null)}
        />
      )}

      {/* 车辆选择器 */}
      <div className="vehicle-bar animate-in">
        {vehicles.length > 0 && (
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
        )}
        <button
          className="add-vehicle-btn"
          onClick={() => setShowAddVehicle(!showAddVehicle)}
        >
          {showAddVehicle ? '收起' : vehicles.length === 0 ? '+ 添加第一辆车' : '+ 添加车辆'}
        </button>
      </div>

      {/* 添加车辆表单 */}
      {showAddVehicle && (
        <form className="vehicle-form animate-in stagger-1" onSubmit={handleAddVehicle}>
          <input
            type="text"
            placeholder="车辆名称 (如 KPT400)"
            value={newVehicleName}
            onChange={(e) => setNewVehicleName(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="车牌号 (可选)"
            value={newVehiclePlate}
            onChange={(e) => setNewVehiclePlate(e.target.value)}
          />
          <input
            type="number"
            step="0.1"
            placeholder="初始里程 (km)"
            value={newVehicleMileage}
            onChange={(e) => setNewVehicleMileage(e.target.value)}
            required
          />
          <button type="submit" className="submit-btn">
            添加
          </button>
        </form>
      )}

      {/* 录入表单 */}
      {currentVehicle && (
        <>
          <form className="record-form animate-in stagger-1" onSubmit={handleSubmit} key={editingId ?? 'new'}>
            <div className="form-section form-section--primary">
              <div className="form-section-header">
                <span className="form-section-icon">🚗</span>
                <span className="form-section-title">
                  {currentVehicle.name}
                </span>
              </div>
              <div className="form-field-grid">
                <label className="form-field">
                  <span className="form-field-label">里程</span>
                  <div className="form-field-input-wrapper">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="8888.8"
                      value={mileage}
                      onChange={(e) => setMileage(e.target.value)}
                      required
                    />
                    <span className="form-field-unit">km</span>
                  </div>
                </label>
                <label className="form-field">
                  <span className="form-field-label">油量</span>
                  <div className="form-field-input-wrapper">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="88.88"
                      value={fuelVolume}
                      onChange={(e) => setFuelVolume(e.target.value)}
                      required
                    />
                    <span className="form-field-unit">L</span>
                  </div>
                </label>
                <label className="form-field">
                  <span className="form-field-label">金额</span>
                  <div className="form-field-input-wrapper">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="88.88"
                      value={fuelCost}
                      onChange={(e) => setFuelCost(e.target.value)}
                      required
                    />
                    <span className="form-field-unit">¥</span>
                  </div>
                </label>
              </div>
            </div>

            <div className="form-divider" />

            <div className="form-section form-section--secondary">
              <label className="toggle-row">
                <span className="toggle-label">加满油箱</span>
                <div className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={isFullTank}
                    onChange={(e) => setIsFullTank(e.target.checked)}
                  />
                  <span className="toggle-track" />
                </div>
              </label>
              <label className="form-field">
                <span className="form-field-label">备注</span>
                <div className="form-field-input-wrapper">
                  <input
                    type="text"
                    placeholder="加油站名、油品标号..."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    list="note-datalist"
                    autoComplete="off"
                  />
                </div>
                <datalist id="note-datalist">
                  {noteSuggestions.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </label>
            </div>

            <button type="submit" className="submit-btn" disabled={submitting}>
              <span className="submit-btn-text">
                {submitting ? '提交中...' : editingId !== null ? '更新记录' : '记录本次加油'}
              </span>
            </button>
            {editingId !== null && (
              <button type="button" className="cancel-btn" onClick={handleCancelEdit}>
                取消编辑
              </button>
            )}
          </form>
        </>
      )}

      {/* 累计统计 + 筛选 */}
      {currentVehicle && (
        <div className="filter-section animate-in stagger-2">
          <div className="filter-row">
            <div className="fuel-summary-select" ref={summaryRef}>
              <button
                className="fuel-summary-trigger"
                onClick={() => setSummaryDropdownOpen(!summaryDropdownOpen)}
              >
                <span className="fuel-summary-text">{formatSummaryLabel(summaryMode)}</span>
                <svg
                  className={`fuel-summary-arrow ${summaryDropdownOpen ? 'open' : ''}`}
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                >
                  <path fill="#888" d="M6 8L1 3h10z" />
                </svg>
              </button>
              {summaryDropdownOpen && (
                <div className="fuel-summary-dropdown">
                  {(['since_last_month', 'month', 'year'] as SummaryMode[]).map((mode) => (
                    <div
                      key={mode}
                      className={`fuel-summary-option ${mode === summaryMode ? 'active' : ''}`}
                      onClick={() => handleSummarySelect(mode)}
                    >
                      {formatSummaryOptionLabel(mode)}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              className="filter-toggle-btn"
              onClick={() => setShowFilter(!showFilter)}
            >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1.5 3.5h13M3.5 8h9M6 12.5h4" />
            </svg>
            {showFilter ? '收起筛选' : '筛选'}
            {(filters.startDate || filters.endDate || filters.fullTank !== undefined || filters.note) && (
              <span className="filter-dot" />
            )}
          </button>
          </div>

          {showFilter && (
            <div className="filter-panel animate-slide-down">
              <div className="filter-panel-grid">
                <label className="filter-field">
                  <span className="filter-field-label">开始日期</span>
                  <input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                  />
                </label>
                <label className="filter-field">
                  <span className="filter-field-label">结束日期</span>
                  <input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                  />
                </label>
                <div className="filter-field filter-field--checks">
                  <label className="filter-check">
                    <input
                      type="checkbox"
                      checked={filters.fullTank === true}
                      onChange={(e) =>
                        setFilterFullTank(e.target.checked ? true : undefined)
                      }
                    />
                    仅加满
                  </label>
                  <label className="filter-check">
                    <input
                      type="checkbox"
                      checked={filters.fullTank === false}
                      onChange={(e) =>
                        setFilterFullTank(e.target.checked ? false : undefined)
                      }
                    />
                    仅未加满
                  </label>
                </div>
                <label className="filter-field filter-field--span">
                  <span className="filter-field-label">备注搜索</span>
                  <input
                    type="text"
                    placeholder="输入加油站名..."
                    value={filters.note}
                    onChange={(e) => setFilterNote(e.target.value)}
                  />
                </label>
              </div>
              <div className="filter-actions">
                <button className="filter-action-btn filter-action-btn--apply" onClick={handleApplyFilter}>
                  应用筛选
                </button>
                <button className="filter-action-btn filter-action-btn--clear" onClick={handleClearFilter}>
                  清除筛选
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 记录列表 */}
      {currentVehicle && (
        <section className="records-section animate-in stagger-3">
          <h2>历史记录</h2>

          {loading && <p className="status-text">加载中...</p>}
          {error && (
            <div className="status-text error">
              <p>{error}</p>
              <button
                className="retry-btn"
                onClick={refreshRecords}
              >
                重新加载
              </button>
            </div>
          )}

          {!loading && !error && records?.length === 0 && (
            <p className="status-text empty">还没记录，去加一箱油吧 🏍️</p>
          )}

          {!loading && records?.length > 0 && (
            <ul className="records-list">
              {records.map((r) => (
                <li key={r.id} className={`record-item ${r.is_baseline ? 'baseline' : ''}`}>
                  <div className="record-main">
                    <span className="record-mileage">{r.mileage.toFixed(1)} km</span>
                    <span className="record-vol">{r.fuel_volume.toFixed(2)} L</span>
                    <span className="record-cost">¥{r.fuel_cost.toFixed(2)}</span>
                  </div>
                  <div className="record-detail">
                    {r.is_baseline ? (
                      <span className="baseline-tag">基线记录</span>
                    ) : r.fuel_consumption != null ? (
                      <span className="record-consumption">
                        油耗：{r.fuel_consumption.toFixed(2)} L/100km
                      </span>
                    ) : (
                      <span className="record-consumption no-data">
                        未加满，未计算油耗
                      </span>
                    )}
                    <span className="record-date">{formatDate(r.record_date)}</span>
                  </div>
                  <div className="record-actions">
                    <button className="edit-btn" onClick={() => handleEdit(r)}>
                      编辑
                    </button>
                    <button className="delete-btn" onClick={() => handleDelete(r.id)}>
                      删除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {records.length < total && !loading && (
            <button className="load-more-btn" onClick={handleLoadMore}>
              加载更多 ({records.length}/{total})
            </button>
          )}

          {loading && records.length > 0 && (
            <p className="load-more-text">加载中...</p>
          )}
        </section>
      )}

      {/* 没有车辆时的引导 */}
      {!currentVehicle && !loading && !showAddVehicle && (
        <section className="records-section animate-in">
          <p className="status-text empty">
            还没有添加车辆，请点击"+ 添加车辆"开始记录
          </p>
        </section>
      )}
    </div>
    </PullToRefresh>
  )
}

export default App
