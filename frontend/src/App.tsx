import { useState, useEffect, type FormEvent } from 'react'
import axios from 'axios'
import {
  fetchRecords,
  createRecord,
  updateRecord,
  deleteRecord,
  type FuelRecord,
  type UpdateRecordPayload,
} from './services/api'
import './App.css'

function App() {
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

  // ---- 首次加载：获取记录列表 ----
  useEffect(() => {
    loadRecords()
  }, [])

  async function loadRecords() {
    setLoading(true)
    setError('')
    try {
      const data = await fetchRecords()
      setRecords(data.records)
    } catch {
      setError('加载记录失败，请检查网络连接')
    } finally {
      setLoading(false)
    }
  }

  // ---- 提交表单（新建 / 修改） ----
  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    // 基本校验
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
        // 修改模式
        await updateRecord(editingId, {
          mileage: km,
          fuel_volume: vol,
          fuel_cost: cost,
        })
      } else {
        // 新建模式
        await createRecord({
          mileage: km,
          fuel_volume: vol,
          fuel_cost: cost,
        })
      }
      // 清空表单 + 退出编辑
      setMileage('')
      setFuelVolume('')
      setFuelCost('')
      setEditingId(null)
      // 刷新列表
      await loadRecords()
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

  // ---- 删除记录 ----
  async function handleDelete(id: number) {
    if (!window.confirm('确定要删除这条加油记录吗？')) return

    try {
      await deleteRecord(id)
      await loadRecords()
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

  // ---- 编辑 / 取消编辑 ----
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

  // ---- 格式化日期 ----
  function formatDate(iso: string) {
    const d = new Date(iso)
    return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  return (
    <div className="app">
      <h1 className="title">⛽ 油耗记录</h1>

      {/* ---- 录入表单 ---- */}
      <form className="record-form" onSubmit={handleSubmit}>
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
          <button
            type="button"
            className="cancel-btn"
            onClick={handleCancelEdit}
          >
            取消编辑
          </button>
        )}
      </form>

      {/* ---- 记录列表 ---- */}
      <section className="records-section">
        <h2>历史记录</h2>

        {loading && <p className="status-text">加载中...</p>}
        {error && <p className="status-text error">{error}</p>}

        {!loading && !error && records?.length === 0 && (
          <p className="status-text empty">
            还没记录，去加一箱油吧 🏍️
          </p>
        )}

        {!loading && records?.length > 0 && (
          <ul className="records-list">
            {records.map((r) => (
              <li
                key={r.id}
                className={`record-item ${r.is_baseline ? 'baseline' : ''}`}
              >
                <div className="record-main">
                  <span className="record-mileage">
                    {r.mileage.toFixed(1)} km
                  </span>
                  <span className="record-vol">
                    {r.fuel_volume.toFixed(2)} L
                  </span>
                  <span className="record-cost">
                    ¥{r.fuel_cost.toFixed(2)}
                  </span>
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
                  <button
                    className="edit-btn"
                    onClick={() => handleEdit(r)}
                  >
                    编辑
                  </button>
                  <button
                    className="delete-btn"
                    onClick={() => handleDelete(r.id)}
                  >
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export default App
