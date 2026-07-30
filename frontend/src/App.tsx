import { useState, useEffect, type FormEvent } from 'react'
import axios from 'axios'
import {
  fetchRecords,
  createRecord,
  updateRecord,
  deleteRecord,
  fetchVehicles,
  createVehicle,
  clearToken,
  type FuelRecord,
  type Vehicle,
} from './services/api'
import './App.css'

const VEHICLE_KEY = 'fuel_records_vehicle_id'

function App() {
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

  // ---- 筛选状态 ----
  const [showFilter, setShowFilter] = useState(false)
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [filterFullTank, setFilterFullTank] = useState<boolean | undefined>(undefined)
  const [filterNote, setFilterNote] = useState('')

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
      // 直接加载不带筛选的记录
      setLoading(true)
      fetchRecords(1, 20, selectedVehicleId)
        .then((data) => setRecords(data.records))
        .catch(() => setError('加载记录失败'))
        .finally(() => setLoading(false))
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

  async function loadRecords(vehicleId: number) {
    setLoading(true)
    setError('')
    try {
      const data = await fetchRecords(
        1, 20, vehicleId,
        filterStartDate || undefined,
        filterEndDate || undefined,
        filterFullTank,
        filterNote || undefined,
      )
      setRecords(data.records)
    } catch {
      setError('加载记录失败，请检查网络连接')
    } finally {
      setLoading(false)
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

  function handleLogout() {
    clearToken()
    window.location.href = '/login'
  }

  function handleGoStats() {
    window.location.href = '/stats'
  }

  function formatDate(iso: string) {
    const d = new Date(iso)
    return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  const currentVehicle = vehicles.find((v) => v.id === selectedVehicleId)

  return (
    <div className="app">
      <div className="header">
        <h1 className="title">油耗记录</h1>
        <div className="header-actions">
          <button className="nav-btn" onClick={handleGoStats}>
            统计
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
          <button
            className="add-vehicle-btn"
            onClick={() => setShowAddVehicle(!showAddVehicle)}
          >
            {showAddVehicle ? '收起' : '+ 添加车辆'}
          </button>
        </div>
      )}

      {/* 添加车辆表单 */}
      {showAddVehicle && (
        <form className="vehicle-form" onSubmit={handleAddVehicle}>
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
          <div className="filter-bar">
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

          <form className="record-form" onSubmit={handleSubmit} key={editingId ?? 'new'}>
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
                  placeholder="如 52345.5"
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
                  placeholder="如 12.50"
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
                  placeholder="如 98.75"
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
        <section className="records-section">
          <h2>历史记录</h2>

          {loading && <p className="status-text">加载中...</p>}
          {error && <p className="status-text error">{error}</p>}

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
        </section>
      )}

      {/* 没有车辆时的引导 */}
      {!currentVehicle && !loading && (
        <section className="records-section">
          <p className="status-text empty">
            还没有添加车辆，请点击"+ 添加车辆"开始记录
          </p>
        </section>
      )}
    </div>
  )
}

export default App
