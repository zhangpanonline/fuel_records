/**
 * App 版本更新检测与安装服务
 *
 * 启动时查询最新版本 → 对比本地 version_code →
 * 有新版本则弹窗确认 → XHR 带进度下载 → 写入设备 → 系统安装器安装
 *
 * 双通道（顺序：自家后端 → Supabase）：
 *   1. GET {API}/api/v1/app/version   走 fuel-records.fly.dev，版本查库、APK 由后端代理
 *   2. GET https://<ref>.supabase.co/rest/v1/app_versions  旧的直连通道
 *
 * 为什么要有第 1 条：supabase.co 在部分网络（家用宽带、移动网络）会在 TLS 握手阶段
 * 被重置，直连查询会失败。旧实现失败时 catch 后 return null，UI 一律显示"已是最新版本"，
 * 用户根本分不清"真的没更新"还是"压根没查成功"。现在两条都失败会明确报 error。
 */

import { Filesystem, Directory } from '@capacitor/filesystem'
import { registerPlugin } from '@capacitor/core'
import pkg from '../../package.json'
import { getApiBaseUrl } from './api'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

/** 将 semver 版本号转为整数 version_code，方便数值比较大小
 *  "0.0.16" → 16, "0.1.15" → 115, "0.10.0" → 1000, "1.0.0" → 10000
 *  公式: MAJOR×10000 + MINOR×100 + PATCH */
function versionToCode(version: string): number {
  const [major, minor, patch] = version.split('.').map(Number)
  return major * 10000 + minor * 100 + patch
}

/** 当前 App 的 version_code，从 package.json 的 version 字段自动计算 */
const CURRENT_VERSION_CODE = versionToCode(pkg.version)

// ── 原生插件 ────────────────────────────────────────

interface ApkInstallerPlugin {
  install(options: { fileName: string }): Promise<{ success: boolean }>
}

const ApkInstaller = registerPlugin<ApkInstallerPlugin>('ApkInstaller')

// ── 类型 ────────────────────────────────────────────

export interface UpdateInfo {
  version_code: number
  version_name: string
  /** 一定是可直接下载的绝对地址（相对路径已在查询阶段补全） */
  apk_url: string
  release_notes?: string | null
}

/** 检测来源，便于排查"到底走的哪条路" */
export type UpdateSource = 'backend' | 'supabase'

export type CheckUpdateResult =
  | { status: 'available'; info: UpdateInfo; source: UpdateSource }
  | { status: 'latest'; source: UpdateSource }
  | { status: 'error'; message: string }

// ── 版本查询 ───────────────────────────────────────

function withTimeout(ms: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, done: () => clearTimeout(timeoutId) }
}

/** 后端返回的 apk_url 是相对路径（/api/v1/app/apk），这里补全成绝对地址 */
function resolveApkUrl(apkUrl: string, base: string): string {
  if (/^https?:\/\//i.test(apkUrl)) return apkUrl
  return `${base}${apkUrl.startsWith('/') ? '' : '/'}${apkUrl}`
}

/** 通道 1：自家后端（推荐，走 fuel-records.fly.dev，不受 supabase.co 阻断影响） */
async function getLatestViaBackend(): Promise<UpdateInfo> {
  const base = getApiBaseUrl()
  const { signal, done } = withTimeout(10_000)
  try {
    const res = await fetch(`${base}/api/v1/app/version`, { signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return {
      version_code: data.version_code,
      version_name: data.version_name,
      apk_url: resolveApkUrl(data.apk_url, base),
      release_notes: data.release_notes ?? null,
    }
  } finally {
    done()
  }
}

/** 通道 2：直连 Supabase REST（旧通道，保留作回退） */
async function getLatestViaSupabase(): Promise<UpdateInfo> {
  const { signal, done } = withTimeout(10_000)
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/app_versions?order=version_code.desc&limit=1`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        signal,
      }
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const rows = await res.json()
    if (!rows || rows.length === 0) throw new Error('无版本记录')
    return {
      version_code: rows[0].version_code,
      version_name: rows[0].version_name,
      apk_url: resolveApkUrl(rows[0].apk_url, getApiBaseUrl()),
      release_notes: rows[0].release_notes ?? null,
    }
  } finally {
    done()
  }
}

/**
 * 版本检测：先走自家后端，失败回退 Supabase，两条都失败才报 error
 * 关键：区分 'latest'（查到了，确实没更新）与 'error'（压根没查成功）
 */
export async function checkUpdate(): Promise<CheckUpdateResult> {
  const attempts: Array<{ source: UpdateSource; run: () => Promise<UpdateInfo> }> = [
    { source: 'backend', run: getLatestViaBackend },
    { source: 'supabase', run: getLatestViaSupabase },
  ]

  const failures: string[] = []

  for (const attempt of attempts) {
    try {
      const latest = await attempt.run()
      if (latest.version_code > CURRENT_VERSION_CODE) {
        return { status: 'available', info: latest, source: attempt.source }
      }
      return { status: 'latest', source: attempt.source }
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      failures.push(
        `${attempt.source === 'backend' ? '自家接口' : 'Supabase'}（${reason}）`
      )
    }
  }

  return { status: 'error', message: failures.join('；') }
}

// ── 下载 ────────────────────────────────────────────

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      // 去掉 data:application/octet-stream;base64, 前缀
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * 下载 APK 并写入设备文件系统
 * @param apkUrl   APK 下载地址
 * @param onProgress  进度回调 (0-100)
 * @returns 本地文件 URI
 */
export function downloadApk(
  apkUrl: string,
  onProgress: (percent: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', apkUrl)
    xhr.responseType = 'blob'

    xhr.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }

    xhr.onload = async () => {
      try {
        const blob = xhr.response as Blob
        const base64 = await blobToBase64(blob)

        const result = await Filesystem.writeFile({
          path: 'fuel_records_update.apk',
          data: base64,
          directory: Directory.Cache,
          recursive: true,
        })

        resolve(result.uri)
      } catch (err) {
        reject(err instanceof Error ? err : new Error('写入文件失败'))
      }
    }

    xhr.onerror = () => reject(new Error('网络错误，下载失败'))
    xhr.send()
  })
}

// ── 安装 ────────────────────────────────────────────

/** 调起系统安装器（通过原生 FileProvider 插件） */
export async function installApk(_localUri: string): Promise<void> {
  await ApkInstaller.install({ fileName: 'fuel_records_update.apk' })
}
