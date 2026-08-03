/**
 * API 服务层
 *
 * 开发环境：Vite 代理将 /api 转发到 localhost:8000
 * 生产环境（Capacitor）：通过 VITE_API_BASE_URL 环境变量指向 Render 地址
 *
 * 数据库切换：前端通过 X-Database-Env 请求头告知后端使用正式库或测试库，
 * 通过 setDatabaseEnv() 切换，默认正式库。切换后需重新登录。
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
  period: string           // "2026-08"
  count: number
  total_volume: number
  total_cost: number
  avg_consumption: number | null
}

export interface MonthlyStats {
  months: MonthlyItem[]
}

// ---- Timeline types (group_by: day / week / month) ----

export interface TimelineItem {
  period: string          // "2026-08-01" | "08-01~08-07" | "2026-08"
  count: number
  total_volume: number
  total_cost: number
  avg_consumption: number | null
}

export interface TimelineStats {
  items: TimelineItem[]
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

// ---- 服务器选择（运行时可切换 Render ↔ Fly.io） ----

const SERVER_KEY = 'fuel_api_server'

/** 服务器 URL 映射表 */
const SERVERS: Record<string, string> = {
  render: 'https://fuel-records.onrender.com',
  flyio: 'https://fuel-records.fly.dev',
}

const DEFAULT_SERVER = 'render'

/** 获取当前服务器标识 */
export function getApiServer(): string {
  return localStorage.getItem(SERVER_KEY) || DEFAULT_SERVER
}

/** 设置服务器标识 */
export function setApiServer(server: string): void {
  localStorage.setItem(SERVER_KEY, server)
}

/** 获取当前服务器的 API base URL */
export function getApiBaseUrl(): string {
  return SERVERS[getApiServer()] || SERVERS[DEFAULT_SERVER]
}

// ---- 数据库环境选择（运行时可切换） ----

const DB_ENV_KEY = 'fuel_db_env'

/** 获取当前数据库环境：'prod' | 'test'，默认 'prod' */
export function getDatabaseEnv(): 'prod' | 'test' {
  return (localStorage.getItem(DB_ENV_KEY) as 'prod' | 'test') || 'prod'
}

/** 设置数据库环境 */
export function setDatabaseEnv(env: 'prod' | 'test'): void {
  localStorage.setItem(DB_ENV_KEY, env)
}

// ---- 用户信息缓存（本地缓存 + 后台刷新） ----

export interface UserInfo {
  id: number
  username: string
  email: string | null
  is_active: boolean
}

const USER_KEY = 'fuel_user_cache'

export function getUserCache(): UserInfo | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as UserInfo) : null
  } catch {
    return null
  }
}

export function setUserCache(user: UserInfo): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearUserCache(): void {
  localStorage.removeItem(USER_KEY)
}

/** 从后端获取当前登录用户信息（需要 token） */
export async function getCurrentUser(): Promise<UserInfo> {
  const res = await apiClient.get<UserInfo>('/api/v1/auth/me')
  return res.data
}

// ---- Axios 实例（带 token + 数据库环境拦截器） ----

const apiClient = axios.create({
  // baseURL 由请求拦截器动态设置（支持运行时切换服务器），不在此处写死
  timeout: 60000, // 60s，容纳 Render 免费层冷启动（休眠后唤醒需 30-60s）
})

// 请求拦截器：动态 baseURL + X-Database-Env + Authorization
apiClient.interceptors.request.use((config) => {
  config.baseURL = getApiBaseUrl()
  config.headers['X-Database-Env'] = getDatabaseEnv()
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

export async function fetchSummary(
  vehicleId: number,
  startDate?: string,
  endDate?: string,
): Promise<SummaryStats> {
  const params: Record<string, string | number> = { vehicle_id: vehicleId }
  if (startDate) params.start_date = startDate
  if (endDate) params.end_date = endDate
  const res = await apiClient.get<SummaryStats>('/api/v1/stats/summary', { params })
  return res.data
}

export async function fetchMonthly(
  vehicleId: number,
  startDate?: string,
  endDate?: string,
): Promise<MonthlyStats> {
  const params: Record<string, string | number> = { vehicle_id: vehicleId }
  if (startDate) params.start_date = startDate
  if (endDate) params.end_date = endDate
  const res = await apiClient.get<MonthlyStats>('/api/v1/stats/monthly', { params })
  return res.data
}

export async function fetchTimeline(
  vehicleId: number,
  groupBy: string,
  startDate?: string,
  endDate?: string,
): Promise<TimelineStats> {
  const params: Record<string, string | number> = { vehicle_id: vehicleId, group_by: groupBy }
  if (startDate) params.start_date = startDate
  if (endDate) params.end_date = endDate
  const res = await apiClient.get<TimelineStats>('/api/v1/stats/timeline', { params })
  return res.data
}

// ---- Export API ----

export async function exportCSV(vehicleId: number): Promise<Blob> {
  const token = getToken()
  const baseURL = getApiBaseUrl()
  const url = `${baseURL}/api/v1/records/export/csv?vehicle_id=${vehicleId}`

  const res = await fetch(url, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Database-Env': getDatabaseEnv(),
    },
  })

  if (!res.ok) {
    throw new Error('导出失败')
  }

  return res.blob()
}

// ---- Expense Types ----

export interface ExpenseCategory {
  id: number
  name: string
  level: number
  sort_order: number
  children: ExpenseCategory[]
}

export interface Expense {
  id: number
  amount: number
  category_l1: string
  category_l2: string
  category_l3: string
  note: string | null
  expense_date: string
  created_at: string
  updated_at: string | null
}

export interface CreateExpensePayload {
  amount: number
  category_l1: string
  category_l2: string
  category_l3: string
  note?: string
  expense_date: string
}

export interface UpdateExpensePayload {
  amount?: number
  category_l1?: string
  category_l2?: string
  category_l3?: string
  note?: string
  expense_date?: string
}

export interface ExpenseListResponse {
  items: Expense[]
  total: number
  page: number
  page_size: number
}

export interface CreateCategoryPayload {
  name: string
  parent_id?: number
  sort_order?: number
}

export interface UpdateCategoryPayload {
  name?: string
  sort_order?: number
}

export interface BreakdownItem {
  category_l1: string
  category_l2: string | null
  category_l3: string | null
  total: number
  percentage: number | null
}

export interface PeriodItem {
  period: string
  total: number
  count: number
  breakdown: BreakdownItem[]
}

export interface ExpenseStatsResponse {
  group_by: string
  total_amount?: number
  record_count?: number
  avg_daily?: number
  category_breakdown?: BreakdownItem[]
  items?: PeriodItem[]
}

export interface MultiSummaryResponse {
  current_year: number
  current_month: number
  current_week: number
  recent_year: number
  recent_month: number
  recent_week: number
}

// ---- Expense API ----

export async function fetchExpenses(
  page = 1,
  pageSize = 20,
  startDate?: string,
  endDate?: string,
  categoryL1?: string,
  categoryL2?: string,
  categoryL3?: string,
): Promise<ExpenseListResponse> {
  const params: Record<string, number | string> = { page, page_size: pageSize }
  if (startDate) params.start_date = startDate
  if (endDate) params.end_date = endDate
  if (categoryL1) params.category_l1 = categoryL1
  if (categoryL2) params.category_l2 = categoryL2
  if (categoryL3) params.category_l3 = categoryL3
  const res = await apiClient.get<ExpenseListResponse>('/api/v1/expenses/', { params })
  return res.data
}

export async function createExpense(
  payload: CreateExpensePayload,
): Promise<Expense> {
  const res = await apiClient.post<Expense>('/api/v1/expenses/', payload)
  return res.data
}

export async function updateExpense(
  id: number,
  payload: UpdateExpensePayload,
): Promise<Expense> {
  const res = await apiClient.put<Expense>(`/api/v1/expenses/${id}`, payload)
  return res.data
}

export async function deleteExpense(id: number): Promise<void> {
  await apiClient.delete(`/api/v1/expenses/${id}`)
}

export async function fetchMultiSummary(): Promise<MultiSummaryResponse> {
  const res = await apiClient.get<MultiSummaryResponse>('/api/v1/expenses/multi_summary')
  return res.data
}

// ---- Category API ----

export async function fetchCategories(): Promise<ExpenseCategory[]> {
  const res = await apiClient.get<{ categories: ExpenseCategory[] }>(
    '/api/v1/expenses/categories',
  )
  return res.data.categories
}

export async function createCategory(
  payload: CreateCategoryPayload,
): Promise<ExpenseCategory> {
  const res = await apiClient.post<ExpenseCategory>(
    '/api/v1/expenses/categories',
    payload,
  )
  return res.data
}

export async function updateCategory(
  id: number,
  payload: UpdateCategoryPayload,
): Promise<ExpenseCategory> {
  const res = await apiClient.put<ExpenseCategory>(
    `/api/v1/expenses/categories/${id}`,
    payload,
  )
  return res.data
}

export async function deleteCategory(id: number): Promise<void> {
  await apiClient.delete(`/api/v1/expenses/categories/${id}`)
}

// ---- Expense Stats API ----

export async function fetchExpenseStats(
  startDate: string,
  endDate: string,
  groupBy: string = 'none',
  categoryL1?: string,
  categoryL2?: string,
  categoryL3?: string,
): Promise<ExpenseStatsResponse> {
  const params: Record<string, string> = {
    start_date: startDate,
    end_date: endDate,
    group_by: groupBy,
  }
  if (categoryL1) params.category_l1 = categoryL1
  if (categoryL2) params.category_l2 = categoryL2
  if (categoryL3) params.category_l3 = categoryL3
  const res = await apiClient.get<ExpenseStatsResponse>(
    '/api/v1/expenses/stats',
    { params },
  )
  return res.data
}
