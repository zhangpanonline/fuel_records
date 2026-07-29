/**
 * API 服务层
 *
 * 开发环境：Vite 代理将 /api 转发到 localhost:8000
 * 生产环境（Capacitor）：通过 VITE_API_BASE_URL 环境变量指向 Render 地址
 */
import axios from 'axios'

// ---- 类型定义（对齐后端 Pydantic Schema） ----

/** 加油记录响应体 */
export interface FuelRecord {
  id: number
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

/** 创建记录的请求体 */
export interface CreateRecordPayload {
  mileage: number
  fuel_volume: number
  fuel_cost: number
  is_full_tank?: boolean
  note?: string
}

/** 分页查询的响应体 */
export interface RecordsResponse {
  total: number
  page: number
  page_size: number
  records: FuelRecord[]
}

// ---- 类型转换辅助函数 ----

/**
 * 后端 Decimal 类型序列化为 JSON 时是字符串（如 "52100.3"），
 * 此函数将字符串转数字，透传 null/undefined。
 */
function parseDecimal(val: unknown): number | null {
  if (val == null || val === '') return null
  return Number(val)
}

/** 将后端原始记录（数字可能是字符串）转为前端 FuelRecord 类型 */
function parseRecord(raw: Record<string, unknown>): FuelRecord {
  return {
    id: raw.id as number,
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

// ---- Axios 实例 ----

const apiClient = axios.create({
  // 开发环境用 Vite 代理（空 baseURL），生产环境用环境变量
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  timeout: 10000,
})

// ---- API 函数 ----

/** 创建加油记录 */
export async function createRecord(
  payload: CreateRecordPayload
): Promise<FuelRecord> {
  const res = await apiClient.post<FuelRecord>('/api/v1/records/', payload)
  return parseRecord(res.data as unknown as Record<string, unknown>)
}

/** 获取加油记录列表（分页） */
export async function fetchRecords(
  page = 1,
  pageSize = 20
): Promise<RecordsResponse> {
  const res = await apiClient.get<RecordsResponse>('/api/v1/records/', {
    params: { page, page_size: pageSize },
  })
  return {
    total: res.data.total,
    page: res.data.page,
    page_size: res.data.page_size,
    records: (res.data.records as unknown as Record<string, unknown>[]).map(parseRecord),
  }
}

/** 修改记录的请求体（所有字段可选） */
export interface UpdateRecordPayload {
  mileage?: number
  fuel_volume?: number
  fuel_cost?: number
  is_full_tank?: boolean
  note?: string
}

/** 修改加油记录 */
export async function updateRecord(
  id: number,
  payload: UpdateRecordPayload
): Promise<FuelRecord> {
  const res = await apiClient.put<FuelRecord>(`/api/v1/records/${id}`, payload)
  return parseRecord(res.data as unknown as Record<string, unknown>)
}

/** 删除加油记录 */
export async function deleteRecord(id: number): Promise<void> {
  await apiClient.delete(`/api/v1/records/${id}`)
}
