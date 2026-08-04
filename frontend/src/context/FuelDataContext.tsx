import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import {
  fetchRecords,
  fetchVehicles,
  type FuelRecord,
  type Vehicle,
} from '../services/api'

const VEHICLE_KEY = 'fuel_records_vehicle_id'
const PAGE_SIZE = 20

interface FilterState {
  startDate: string
  endDate: string
  fullTank: boolean | undefined
  note: string
}

interface FuelData {
  vehicles: Vehicle[]
  selectedVehicleId: number | null
  setSelectedVehicleId: (id: number) => void
  records: FuelRecord[]
  total: number
  page: number
  loading: boolean
  error: string
  filters: FilterState
  setFilterStartDate: (d: string) => void
  setFilterEndDate: (d: string) => void
  setFilterFullTank: (v: boolean | undefined) => void
  setFilterNote: (n: string) => void
  showFilter: boolean
  setShowFilter: (v: boolean) => void
  showAddVehicle: boolean
  setShowAddVehicle: (v: boolean) => void
  loadVehicles: () => Promise<void>
  loadRecords: (vehicleId: number, pageNum?: number) => Promise<void>
  refreshRecords: () => Promise<void>
  addVehicle: (v: Vehicle) => void
}

const FuelDataContext = createContext<FuelData | null>(null)

export function FuelDataProvider({ children }: { children: ReactNode }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null)
  const [showAddVehicle, setShowAddVehicle] = useState(false)

  const [records, setRecords] = useState<FuelRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [showFilter, setShowFilter] = useState(false)
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [filterFullTank, setFilterFullTank] = useState<boolean | undefined>(undefined)
  const [filterNote, setFilterNote] = useState('')

  // useRef 持有最新 filter 值，避免 loadRecords 依赖 filter 状态变化
  const filtersRef = useRef({ startDate: '', endDate: '', fullTank: undefined as boolean | undefined, note: '' })
  filtersRef.current = { startDate: filterStartDate, endDate: filterEndDate, fullTank: filterFullTank, note: filterNote }

  const loadVehicles = useCallback(async () => {
    try {
      const list = await fetchVehicles()
      if (list.length === 0) {
        setShowAddVehicle(true)
        setRecords([])
        setLoading(false)
        return
      }
      setVehicles(list)
      const savedId = localStorage.getItem(VEHICLE_KEY)
      const saved = savedId ? Number(savedId) : null
      const exists = list.find((v) => v.id === saved)
      setSelectedVehicleId(exists ? saved! : list[0].id)
    } catch {
      setError('加载车辆列表失败')
      setLoading(false)
    }
  }, [])

  const loadRecords = useCallback(async (vehicleId: number, pageNum = 1) => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchRecords(
        pageNum, PAGE_SIZE, vehicleId,
        filtersRef.current.startDate || undefined,
        filtersRef.current.endDate || undefined,
        filtersRef.current.fullTank,
        filtersRef.current.note || undefined,
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
  }, [])

  const refreshRecords = useCallback(async () => {
    if (selectedVehicleId !== null) {
      await loadRecords(selectedVehicleId)
    }
  }, [selectedVehicleId, loadRecords])

  // 首次加载
  useEffect(() => {
    loadVehicles()
  }, [loadVehicles])

  // 车辆变化时加载记录
  useEffect(() => {
    if (selectedVehicleId !== null) {
      loadRecords(selectedVehicleId)
      localStorage.setItem(VEHICLE_KEY, String(selectedVehicleId))
    }
  }, [selectedVehicleId, loadRecords])

  const addVehicle = useCallback((v: Vehicle) => {
    setVehicles((prev) => [...prev, v])
  }, [])

  const value: FuelData = {
    vehicles,
    selectedVehicleId,
    setSelectedVehicleId,
    records,
    total,
    page,
    loading,
    error,
    filters: {
      startDate: filterStartDate,
      endDate: filterEndDate,
      fullTank: filterFullTank,
      note: filterNote,
    },
    setFilterStartDate,
    setFilterEndDate,
    setFilterFullTank,
    setFilterNote,
    showFilter,
    setShowFilter,
    showAddVehicle,
    setShowAddVehicle,
    loadVehicles,
    loadRecords,
    refreshRecords,
    addVehicle,
  }

  return (
    <FuelDataContext.Provider value={value}>
      {children}
    </FuelDataContext.Provider>
  )
}

export function useFuelData() {
  const ctx = useContext(FuelDataContext)
  if (!ctx) throw new Error('useFuelData must be inside FuelDataProvider')
  return ctx
}
