/**
 * API 服务层
 *
 * 开发环境：Vite 代理将 /api 转发到 localhost:8000
 * 生产环境（Capacitor）：通过 VITE_API_BASE_URL 环境变量指向 Render 地址
 */
import axios from 'axios'

// ---- 类型定义（对齐后端 Pydantic Schema） ----

export interface FuelRecord {
  id: number
  user_id: number | null
  vehicle_id: number | null
  mileage: number
  fuel_volume: number
  fuel_cost: number
  unit_price: number | null
  is_full_tank: boolean
  is_baseline: boolean
  fuel_consumption: number | null
  note: string
  record_date: string
  created_at: string
}

export interface CreateRecordPayload {
  vehicle_id: number
  mileage: number
  fuel_volume: number
  fuel_cost: number
  is_full_tank?: boolean
  note?: string
}

export interface Vehicle {
  id: number
  user_id: number
  name: string
  plate: string | null
  initial_mileage: number
  is_active: boolean
  created_at: string
}

export interface CreateVehiclePayload {
  name: string
  plate?: string
  initial_mileage: number
}

export interface RecordsResponse {
  total: number
  page: number
  page_size: number
  records: FuelRecord[]
}

export interface UpdateRecordPayload {
  mileage?: number
  fuel_volume?: number
  fuel_cost?: number
  is_full_tank?: boolean
  note?: string
}

// ---- Stats types ----

export interface SummaryStats {
  record_count: number
  total_mileage: number
  total_fuel_volume: number
  total_fuel_cost: number
  avg_consumption: number | null
  avg_unit_price: number | null
}

export interface MonthlyItem {
  month: number
  count: number
  total_volume: number
  total_cost: number
  avg_consumption: number | null
}

export interface MonthlyStats {
  year: number
  months: MonthlyItem[]
}

export interface TokenResponse {
  access_token: string
  token_type: string
}

// ---- 类型转换辅助 ----

function parseDecimal(val: unknown): number | null {
  if (val == null || val === '') return null
  return Number(val)
}

function parseRecord(raw: Record<string, unknown>): FuelRecord {
  return {
    id: raw.id as number,
    user_id: (raw.user_id as number) ?? null,
    vehicle_id: (raw.vehicle_id as number) ?? null,
    mileage: Number(raw.mileage),
    fuel_volume: Number(raw.fuel_volume),
    fuel_cost: Number(raw.fuel_cost),
    unit_price: parseDecimal(raw.unit_price),
    is_full_tank: raw.is_full_tank as boolean,
    is_baseline: raw.is_baseline as boolean,
    fuel_consumption: parseDecimal(raw.fuel_consumption),
    note: (raw.note as string) ?? '',
    record_date: raw.record_date as string,
    created_at: raw.created_at as string,
  }
}

// ---- Token 管理 ----

const TOKEN_KEY = 'fuel_records_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export function isLoggedIn(): boolean {
  return !!getToken()
}

// ---- Axios 实例（带 token 拦截器） ----

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  timeout: 10000,
})

// 请求拦截器：自动附加 Authorization 头
apiClient.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截器：401 时自动清除 token
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      clearToken()
      // 如果不是在登录页，跳转到登录页
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

// ---- Auth API ----

export async function register(
  username: string,
  password: string,
): Promise<TokenResponse> {
  const res = await apiClient.post<TokenResponse>('/api/v1/auth/register', {
    username,
    password,
  })
  return res.data
}

export async function login(
  username: string,
  password: string,
): Promise<TokenResponse> {
  const res = await apiClient.post<TokenResponse>('/api/v1/auth/login', {
    username,
    password,
  })
  return res.data
}

// ---- Records API ----

export async function createRecord(
  payload: CreateRecordPayload,
): Promise<FuelRecord> {
  const res = await apiClient.post<FuelRecord>('/api/v1/records/', payload)
  return parseRecord(res.data as unknown as Record<string, unknown>)
}

export async function fetchRecords(
  page = 1,
  pageSize = 20,
  vehicleId?: number,
  startDate?: string,
  endDate?: string,
  isFullTank?: boolean,
  note?: string,
): Promise<RecordsResponse> {
  const params: Record<string, number | string | boolean> = { page, page_size: pageSize }
  if (vehicleId !== undefined) {
    params.vehicle_id = vehicleId
  }
  if (startDate) {
    params.start_date = startDate
  }
  if (endDate) {
    params.end_date = endDate
  }
  if (isFullTank !== undefined) {
    params.is_full_tank = isFullTank
  }
  if (note) {
    params.note = note
  }
  const res = await apiClient.get<RecordsResponse>('/api/v1/records/', { params })
  return {
    total: res.data.total,
    page: res.data.page,
    page_size: res.data.page_size,
    records: (res.data.records as unknown as Record<string, unknown>[]).map(parseRecord),
  }
}

export async function updateRecord(
  id: number,
  payload: UpdateRecordPayload,
): Promise<FuelRecord> {
  const res = await apiClient.put<FuelRecord>(`/api/v1/records/${id}`, payload)
  return parseRecord(res.data as unknown as Record<string, unknown>)
}

export async function deleteRecord(id: number): Promise<void> {
  await apiClient.delete(`/api/v1/records/${id}`)
}

// ---- Vehicles API ----

export async function fetchVehicles(): Promise<Vehicle[]> {
  const res = await apiClient.get<Vehicle[]>('/api/v1/vehicles/')
  return res.data
}

export async function createVehicle(
  payload: CreateVehiclePayload,
): Promise<Vehicle> {
  const res = await apiClient.post<Vehicle>('/api/v1/vehicles/', payload)
  return res.data
}

export async function updateVehicle(
  id: number,
  payload: { name?: string; plate?: string; is_active?: boolean },
): Promise<Vehicle> {
  const res = await apiClient.put<Vehicle>(`/api/v1/vehicles/${id}`, payload)
  return res.data
}

export async function deleteVehicle(id: number): Promise<void> {
  await apiClient.delete(`/api/v1/vehicles/${id}`)
}

// ---- Stats API ----

export async function fetchSummary(vehicleId: number): Promise<SummaryStats> {
  const res = await apiClient.get<SummaryStats>('/api/v1/stats/summary', {
    params: { vehicle_id: vehicleId },
  })
  return res.data
}

export async function fetchMonthly(
  vehicleId: number,
  year: number,
): Promise<MonthlyStats> {
  const res = await apiClient.get<MonthlyStats>('/api/v1/stats/monthly', {
    params: { vehicle_id: vehicleId, year },
  })
  return res.data
}
