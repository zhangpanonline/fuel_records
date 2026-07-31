/**
 * App 版本更新检测与安装服务
 *
 * 启动时查询 Supabase app_versions 表 → 对比本地 version_code →
 * 有新版本则弹窗确认 → XHR 带进度下载 → 写入设备 → 系统安装器安装
 */

import { Filesystem, Directory } from '@capacitor/filesystem'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

/** 当前 App 的 version_code，首次发布为 1，之后每次发版通过 scripts/upload-apk.js 递增 */
const CURRENT_VERSION_CODE = 1

// ── 类型 ────────────────────────────────────────────

export interface UpdateInfo {
  version_code: number
  version_name: string
  apk_url: string
}

interface SupabaseRow {
  version_code: number
  version_name: string
  apk_url: string
}

// ── 版本查询 ───────────────────────────────────────

/** 从 Supabase 获取最新版本信息，10s 超时，失败返回 null */
async function getLatestVersion(): Promise<UpdateInfo | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10_000)

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/app_versions?order=version_code.desc&limit=1`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        signal: controller.signal,
      }
    )
    clearTimeout(timeoutId)

    if (!res.ok) return null
    const data: SupabaseRow[] = await res.json()
    if (!data || data.length === 0) return null

    return {
      version_code: data[0].version_code,
      version_name: data[0].version_name,
      apk_url: data[0].apk_url,
    }
  } catch {
    clearTimeout(timeoutId)
    return null
  }
}

/** 版本检测：对比远程 version_code，有更新则返回 UpdateInfo，否则 null */
export async function checkUpdate(): Promise<UpdateInfo | null> {
  const latest = await getLatestVersion()
  if (!latest) return null
  if (latest.version_code > CURRENT_VERSION_CODE) {
    return latest
  }
  return null
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
          directory: Directory.ExternalStorage,
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

/** 调起系统安装器（Android 上通过文件 URI 触发系统 Package Installer） */
export async function installApk(localUri: string): Promise<void> {
  try {
    // Capacitor WebView 中通过 window.open 打开 APK 文件
    // Android 系统会识别 MIME 类型并调起 Package Installer
    window.open(localUri, '_blank')
  } catch {
    throw new Error('无法打开安装器，请手动安装')
  }
}
