import { useState, useEffect, type FormEvent } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import {
  fetchRecords,
  createRecord,
  updateRecord,
  deleteRecord,
  fetchVehicles,
  createVehicle,
  exportCSV,
  type FuelRecord,
  type Vehicle,
} from './services/api'
import { checkUpdate, downloadApk, installApk, type UpdateInfo } from './services/upgrade'
import './App.css'

const VEHICLE_KEY = 'fuel_records_vehicle_id'
const REMINDER_KEY = 'fuel_records_reminder'
const REMINDER_INTERVAL = 7 * 24 * 60 * 60 * 1000 // 7 天

function App() {
  const navigate = useNavigate()

  // ---- 车辆状态 ----
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null)
  const [showAddVehicle, setShowAddVehicle] = useState(false)
  const [newVehicleName, setNewVehicleName] = useState('')
  const [newVehiclePlate, setNewVehiclePlate] = useState('')
  const [newVehicleMileage, setNewVehicleMileage] = useState('')

  // ---- 表单状态 ----
  const [mileage, setMileage] = useState('')
  const [fuelVolume, setFuelVolume] = useState('')
  const [fuelCost, setFuelCost] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  // ---- 列表状态 ----
  const [records, setRecords] = useState<FuelRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const PAGE_SIZE = 20

  // ---- 筛选状态 ----
  const [showFilter, setShowFilter] = useState(false)
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [filterFullTank, setFilterFullTank] = useState<boolean | undefined>(undefined)
  const [filterNote, setFilterNote] = useState('')

  // ---- 加油提醒 ----
  const reminderEnabled = localStorage.getItem(REMINDER_KEY) === 'true'
  const [reminder, setReminder] = useState(reminderEnabled)

  // ---- 版本更新 ----
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [installing, setInstalling] = useState(false)

  function handleToggleReminder() {
    const next = !reminder
    setReminder(next)
    localStorage.setItem(REMINDER_KEY, String(next))
    if (next) {
      requestNotificationPermission()
    }
  }

  function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }

  // 加油提醒定时器
  useEffect(() => {
    if (!reminder) return
    const timer = setInterval(() => {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('⛽ 油耗记录', {
          body: '该加油了！别忘了记录这次的加油数据哦',
          icon: '/favicon.ico',
        })
      }
    }, REMINDER_INTERVAL)
    return () => clearInterval(timer)
  }, [reminder])

  // 加载车辆列表
  useEffect(() => {
    loadVehicles()
  }, [])

  // 车辆变化时加载对应记录
  useEffect(() => {
    if (selectedVehicleId !== null) {
      loadRecords(selectedVehicleId)
      localStorage.setItem(VEHICLE_KEY, String(selectedVehicleId))
    }
  }, [selectedVehicleId])

  // 筛选条件变化时重新加载
  function handleApplyFilter() {
    if (selectedVehicleId !== null) {
      loadRecords(selectedVehicleId)
    }
  }

  function handleClearFilter() {
    setFilterStartDate('')
    setFilterEndDate('')
    setFilterFullTank(undefined)
    setFilterNote('')
    if (selectedVehicleId !== null) {
      loadRecords(selectedVehicleId, 1)
    }
  }

  async function loadVehicles() {
    try {
      const list = await fetchVehicles()
      if (list.length === 0) {
        // 没有车辆，显示添加界面
        setShowAddVehicle(true)
        setRecords([])
        setLoading(false)
        return
      }
      setVehicles(list)
      // 恢复上次选中的车辆，或默认选第一个
      const savedId = localStorage.getItem(VEHICLE_KEY)
      const saved = savedId ? Number(savedId) : null
      const exists = list.find((v) => v.id === saved)
      setSelectedVehicleId(exists ? saved! : list[0].id)
    } catch {
      setError('加载车辆列表失败')
      setLoading(false)
    }
  }

  async function loadRecords(vehicleId: number, pageNum = 1) {
    setLoading(true)
    setError('')
    try {
      const data = await fetchRecords(
        pageNum, PAGE_SIZE, vehicleId,
        filterStartDate || undefined,
        filterEndDate || undefined,
        filterFullTank,
        filterNote || undefined,
      )
      setTotal(data.total)
      if (pageNum === 1) {
        setRecords(data.records)
      } else {
        setRecords((prev) => [...prev, ...data.records])
      }
      setPage(pageNum)
    } catch {
      setError('加载记录失败，请检查网络连接')
    } finally {
      setLoading(false)
    }
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
      setVehicles([...vehicles, v])
      setNewVehicleName('')
      setNewVehiclePlate('')
      setNewVehicleMileage('')
      setShowAddVehicle(false)
      setSelectedVehicleId(v.id)
    } catch (err: unknown) {
      let msg = '添加车辆失败'
      if (axios.isAxiosError(err) && err.response?.data?.detail) {
        msg = err.response.data.detail
      }
      alert(msg)
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
        })
      } else {
        await createRecord({
          vehicle_id: selectedVehicleId,
          mileage: km,
          fuel_volume: vol,
          fuel_cost: cost,
        })
      }
      setMileage('')
      setFuelVolume('')
      setFuelCost('')
      setEditingId(null)
      await loadRecords(selectedVehicleId)
    } catch (err: unknown) {
      let msg = '操作失败，请重试'
      if (axios.isAxiosError(err) && err.response?.data?.detail) {
        msg = err.response.data.detail
      } else if (err instanceof Error) {
        msg = err.message
      }
      alert(msg)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm('确定要删除这条加油记录吗？')) return
    try {
      await deleteRecord(id)
      if (selectedVehicleId !== null) {
        await loadRecords(selectedVehicleId)
      }
    } catch (err: unknown) {
      let msg = '删除失败，请重试'
      if (axios.isAxiosError(err) && err.response?.data?.detail) {
        msg = err.response.data.detail
      } else if (err instanceof Error) {
        msg = err.message
      }
      alert(msg)
    }
  }

  function handleEdit(record: FuelRecord) {
    setEditingId(record.id)
    setMileage(record.mileage.toString())
    setFuelVolume(record.fuel_volume.toString())
    setFuelCost(record.fuel_cost.toString())
  }

  function handleCancelEdit() {
    setEditingId(null)
    setMileage('')
    setFuelVolume('')
    setFuelCost('')
  }

  function handleGoStats() {
    navigate('/fuel/stats')
  }

  // 版本检测（启动时执行一次）
  useEffect(() => {
    checkUpdate().then((info) => {
      if (info) setUpdateInfo(info)
    })
  }, [])

  async function handleStartDownload() {
    if (!updateInfo) return
    setDownloadProgress(0)
    setDownloadError(null)
    try {
      const localUri = await downloadApk(updateInfo.apk_url, (pct) => {
        setDownloadProgress(pct)
      })
      setDownloadProgress(null)
      setInstalling(true)
      await installApk(localUri)
      // 安装器成功唤起后才关闭弹窗
      setUpdateInfo(null)
      setInstalling(false)
    } catch (err) {
      setDownloadProgress(null)
      setInstalling(false)
      setDownloadError(
        err instanceof Error ? err.message : '下载失败，请重试'
      )
    }
  }

  async function handleRetryDownload() {
    setDownloadError(null)
    await handleStartDownload()
  }

  async function handleExport() {
    if (selectedVehicleId === null) return
    try {
      const blob = await exportCSV(selectedVehicleId)
      const url = URL.createObjectURL(blob)
      const vehicleName = currentVehicle?.name || 'vehicle'

      // 尝试使用分享 API（移动端支持更好）
      if (navigator.share && navigator.canShare) {
        const file = new File([blob], `fuel_records_${vehicleName}.csv`, {
          type: 'text/csv',
        })
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: '油耗记录导出' })
          URL.revokeObjectURL(url)
          return
        }
      }

      // 回退：浏览器下载
      const a = document.createElement('a')
      a.href = url
      a.download = `fuel_records_${vehicleName}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      // 用户取消分享不算错误
      if (err instanceof DOMException && err.name === 'AbortError') return
      alert('导出失败，请重试')
    }
  }

  function formatDate(iso: string) {
    const d = new Date(iso)
    return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  const currentVehicle = vehicles.find((v) => v.id === selectedVehicleId)

  return (
    <div className="app">
      {/* 版本更新弹窗 */}
      {updateInfo && (
        <div className="upgrade-overlay">
          <div className="upgrade-modal animate-scale">
            {downloadProgress !== null ? (
              <>
                <h2 className="upgrade-title">正在下载更新</h2>
                <div className="upgrade-progress-bar">
                  <div
                    className="upgrade-progress-fill"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
                <p className="upgrade-progress-text">
                  正在下载... {downloadProgress}%
                </p>
              </>
            ) : installing ? (
              <>
                <h2 className="upgrade-title">正在准备安装</h2>
                <p className="upgrade-body">即将打开系统安装器…</p>
              </>
            ) : downloadError ? (
              <>
                <h2 className="upgrade-title">下载失败</h2>
                <p className="upgrade-body">{downloadError}</p>
                <div className="upgrade-actions">
                  <button className="upgrade-btn secondary" onClick={handleRetryDownload}>
                    重试
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="upgrade-title">发现新版本</h2>
                <p className="upgrade-body">
                  当前版本：v{import.meta.env.VITE_APP_VERSION || '1.0.0'}
                  <br />
                  最新版本：v{updateInfo.version_name}
                </p>
                <div className="upgrade-actions">
                  <button
                    className="upgrade-btn secondary"
                    onClick={() => setUpdateInfo(null)}
                  >
                    暂不更新
                  </button>
                  <button className="upgrade-btn primary" onClick={handleStartDownload}>
                    立即更新
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="header">
        <div className="header-actions" style={{ justifyContent: 'flex-end', width: '100%' }}>
          <button className="nav-btn" onClick={handleGoStats}>
            统计
          </button>
          <button className="export-btn" onClick={handleExport}>
            导出
          </button>
        </div>
      </div>

      {/* 车辆选择器 — 按钮始终可见，select 仅在有车辆时显示 */}
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

      {/* 加油提醒开关 */}
      <div className="reminder-bar animate-in stagger-2">
        <label className="reminder-label">
          <input
            type="checkbox"
            checked={reminder}
            onChange={handleToggleReminder}
          />
          {' '}每周加油提醒
        </label>
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
          {/* 筛选栏 */}
          <div className="filter-bar animate-in stagger-1">
            <button
              className="filter-toggle-btn"
              onClick={() => setShowFilter(!showFilter)}
            >
              {showFilter ? '收起筛选' : '筛选'}
              {(filterStartDate || filterEndDate || filterFullTank !== undefined || filterNote) && (
                <span className="filter-dot" />
              )}
            </button>
          </div>

          {showFilter && (
            <div className="filter-panel">
              <div className="filter-row">
                <label>
                  开始日期
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                  />
                </label>
                <label>
                  结束日期
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                  />
                </label>
              </div>
              <div className="filter-row">
                <label>
                  <input
                    type="checkbox"
                    checked={filterFullTank === true}
                    onChange={(e) =>
                      setFilterFullTank(e.target.checked ? true : undefined)
                    }
                  />
                  {' '}仅加满
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={filterFullTank === false}
                    onChange={(e) =>
                      setFilterFullTank(e.target.checked ? false : undefined)
                    }
                  />
                  {' '}仅未加满
                </label>
              </div>
              <div className="filter-row">
                <input
                  type="text"
                  placeholder="搜索备注 (如加油站名)"
                  value={filterNote}
                  onChange={(e) => setFilterNote(e.target.value)}
                />
              </div>
              <div className="filter-actions">
                <button className="submit-btn" onClick={handleApplyFilter}>
                  应用筛选
                </button>
                <button className="cancel-btn" onClick={handleClearFilter}>
                  清除筛选
                </button>
              </div>
            </div>
          )}

          <form className="record-form animate-in stagger-2" onSubmit={handleSubmit} key={editingId ?? 'new'}>
            <p className="form-hint">
              当前车辆：<strong>{currentVehicle.name}</strong>
            </p>
            <div className="form-row">
              <label>
                里程 (km)
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="8888.8"
                  value={mileage}
                  onChange={(e) => setMileage(e.target.value)}
                  required
                />
              </label>
              <label>
                油量 (L)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="88.88"
                  value={fuelVolume}
                  onChange={(e) => setFuelVolume(e.target.value)}
                  required
                />
              </label>
              <label>
                金额 (元)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="88.88"
                  value={fuelCost}
                  onChange={(e) => setFuelCost(e.target.value)}
                  required
                />
              </label>
            </div>
            <button type="submit" className="submit-btn" disabled={submitting}>
              {submitting ? '提交中...' : editingId !== null ? '更新记录' : '提交记录'}
            </button>
            {editingId !== null && (
              <button type="button" className="cancel-btn" onClick={handleCancelEdit}>
                取消编辑
              </button>
            )}
          </form>
        </>
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
                onClick={() => selectedVehicleId !== null && loadRecords(selectedVehicleId)}
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

          {/* 加载更多 */}
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

      {/* 没有车辆时的引导 — 仅当添加车辆表单未展示时 */}
      {!currentVehicle && !loading && !showAddVehicle && (
        <section className="records-section animate-in">
          <p className="status-text empty">
            还没有添加车辆，请点击"+ 添加车辆"开始记录
          </p>
        </section>
      )}
    </div>
  )
}

export default App
