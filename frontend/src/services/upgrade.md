# App 版本更新检测与安装 — 技术规格书

> 本规格书基于多轮架构盘问（/grill-me）后形成，覆盖从版本检测、APK 下发、到系统安装的完整链路。

---

## 1. 核心目标

为摩托车油耗记录 App（React + Capacitor 打包的 Android APK）提供 **启动时自动版本检测 + 用户确认下载 + 系统安装器安装** 的完整升级能力。

**业务痛点**：目前每次发新版本 APK，必须手动传到手机 → 打开文件管理器 → 点击安装。本功能让用户在 App 内完成"检测→下载→安装"闭环。

---

## 2. 核心逻辑与用户交互

### 2.1 用户可见流程

```
用户打开 App
  │
  ▼
App 启动 → 请求 Supabase REST API 查询最新版本
  │
  ├── 无新版本 → 正常进入 App（无任何弹窗，静默完成）
  │
  └── 有新版本 → 弹窗
        ├── [暂不更新] → 关闭弹窗，正常使用 App
        │                  ★ 下次启动 App 时继续弹（不记住跳过）
        │
        └── [立即更新] → 显示下载进度条
              ├── 下载成功 → 调起 Android 系统安装器
              │              （用户看到系统级"是否安装此应用？"弹窗）
              │
              └── 下载失败 → 显示错误提示 + [重试] 按钮
```

### 2.2 弹窗设计

- **标题**：发现新版本
- **内容**：`当前版本: v1.0.0，最新版本: v1.1.0`
- **按钮**：[暂不更新] / [立即更新]
- 没有 [x] 关闭按钮（必须二选一）
- 不做"跳过此版本"去重（每次启动都弹，直到用户安装）

### 2.3 下载进度条

- 弹窗内显示进度百分比 + 横向进度条
- 格式：`正在下载... 62%`
- 下载中不可关闭弹窗（防止用户中途取消导致状态混乱）

### 2.4 下载完成 → 系统安装

下载完成后，通过 Capacitor Filesystem 将 APK 写入设备存储，然后通过 Intent 调起 Android 系统 Package Installer。用户看到系统级安装确认弹窗后，后续流程由 Android 系统接管（不再由本文档覆盖）。

---

## 3. 技术设计与状态管理

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────┐
│                   Supreme                             │
│  ┌─────────────┐                                    │
│  │ app_versions │  Storage                           │
│  │   (表)       │  ┌──────────────────────┐         │
│  ├─────────────┤  │  fuel_records.apk     │         │
│  │ version_code │  │  (public bucket)      │         │
│  │ version_name │  └──────────────────────┘         │
│  │ apk_url      │                                    │
│  └─────────────┘                                    │
└───────────┬─────────────────────────────────────────┘
            │ REST API (anon key + RLS)
            ▼
┌─────────────────────────────────────────────────────┐
│                Frontend (Capacitor App)               │
│                                                      │
│  main.tsx (挂载点)                                    │
│    └── App.tsx (useEffect 中调用 checkUpdate)        │
│          └── services/upgrade.ts                     │
│               ├── checkVersion()   → 查 Supabase     │
│               ├── downloadApk()    → XHR + 进度     │
│               └── installApk()     → Filesystem +    │
│                                       Intent         │
│  vite.config.ts                                      │
│    └── define: VITE_APP_VERSION ← package.json       │
└─────────────────────────────────────────────────────┘
```

### 3.2 Supabase 数据库变更

#### 新建表 `app_versions`

```sql
CREATE TABLE app_versions (
    id           SERIAL PRIMARY KEY,
    version_code INTEGER      NOT NULL,          -- Android 用，整数递增（如 1, 2, 3）
    version_name VARCHAR(20)  NOT NULL,          -- 展示用，如 "1.1.0"
    apk_url      TEXT         NOT NULL,          -- Supabase Storage 公开 URL
    release_notes TEXT        DEFAULT '',         -- 更新说明（留空也行）
    created_at   TIMESTAMPTZ  DEFAULT NOW()
);

-- RLS 策略：允许匿名 SELECT（anon key 可读）
ALTER TABLE app_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon can read app_versions"
    ON app_versions FOR SELECT
    TO anon
    USING (true);
```

#### Supabase Storage

- 创建 bucket：`apk`（勾选 **public**）
- 文件上传到这个 bucket，得到公开 URL：
  `https://<project>.supabase.co/storage/v1/object/public/apk/fuel_records.apk`

### 3.3 前端变更

#### `vite.config.ts` — 注入运行时版本号

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
})
```

#### `frontend/src/services/upgrade.ts`（新建）

- `getLatestVersion(): Promise<{version_code, version_name, apk_url} | null>`
  - 请求 Supabase REST API：`GET /rest/v1/app_versions?order=version_code.desc&limit=1`
  - 请求头：`apikey: <SUPABASE_ANON_KEY>`, `Authorization: Bearer <SUPABASE_ANON_KEY>`
  - 返回最新一条记录的 `version_name` 和 `apk_url`

- `checkUpdate(): Promise<{hasUpdate, latestVersion, apkUrl} | null>`
  - 调用 `getLatestVersion()`
  - 用硬编码 `CURRENT_VERSION_CODE`（整数，初始值 1）对比 Supabase 返回的 `version_code`
  - **注意**：`CURRENT_VERSION_CODE` 由 `upload-apk.js` 发版时自动回写，无需手动维护
  - 如果 `version_code > CURRENT_VERSION_CODE` → 返回 `{hasUpdate: true, ...}`

- `downloadApk(apkUrl, onProgress): Promise<string>`
  - 使用 `XMLHttpRequest`（非 fetch，因需进度事件）
  - `responseType = "blob"`
  - `onprogress` 回调：`(percent: number) => void`
  - 下载完成后，用 `@capacitor/filesystem` 的 `writeFile()` 将 Blob 写入设备文件系统
  - 返回本地文件路径

- `installApk(localPath: string): Promise<void>`
  - 获取文件 URI
  - 使用 Capacitor Intent 或直接创建 `Intent.ACTION_VIEW` 调起系统安装器
  - 需要 AndroidManifest.xml 添加 `REQUEST_INSTALL_PACKAGES` 权限（Android 8.0+）

#### `frontend/src/App.tsx` 变更

在 App 组件挂载时新增 `useEffect`：

```ts
useEffect(() => {
  checkUpdate().then((result) => {
    if (result?.hasUpdate) {
      setUpdateInfo(result) // 触发弹窗
    }
  })
}, [])
```

新增状态：
```ts
const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
const [downloadProgress, setDownloadProgress] = useState<number | null>(null)
const [downloadError, setDownloadError] = useState<string | null>(null)
```

### 3.4 发版自动化脚本

#### `scripts/upload-apk.js`（新建，项目根目录）

```js
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')
const pkg = require('../frontend/package.json')

const supabaseUrl = process.env.SUPABASE_URL     // 从环境变量读取
const supabaseKey = process.env.SUPABASE_SERVICE_KEY  // Service Role Key

async function main() {
  const supabase = createClient(supabaseUrl, supabaseKey)

  // 1. 上传 APK 到 Storage
  const apkPath = path.resolve(__dirname, '../frontend/android/app/build/outputs/apk/debug/app-debug.apk')
  const file = fs.readFileSync(apkPath)
  const { error: uploadError } = await supabase.storage
    .from('apk')
    .upload('fuel_records.apk', file, { upsert: true })

  if (uploadError) throw uploadError

  // 2. 获取公开 URL
  const { data: urlData } = supabase.storage
    .from('apk')
    .getPublicUrl('fuel_records.apk')

  // 3. 查询当前最大 version_code
  const { data: latest } = await supabase
    .from('app_versions')
    .select('version_code')
    .order('version_code', { ascending: false })
    .limit(1)

  const newCode = (latest?.[0]?.version_code ?? 0) + 1

  // 4. INSERT 新版本记录
  const { error: insertError } = await supabase
    .from('app_versions')
    .insert({
      version_code: newCode,
      version_name: pkg.version,
      apk_url: urlData.publicUrl,
    })

  if (insertError) throw insertError

  console.log(`✅ v${pkg.version} (code ${newCode}) 发布完成`)
}

main().catch((err) => {
  console.error('❌ 发版失败:', err)
  process.exit(1)
})
```

运行方式：
```bash
cd frontend
export JAVA_HOME=$(/usr/libexec/java_home -v 21)  # 必须 JDK 21
npm version patch && npm run build:apk && export $(grep -v '^#' ../.env | xargs) && node ../scripts/upload-apk.js
```

构建产物会自动输出到 `dist/fuel_records_vX.X.X.apk`（带版本号的文件名）。

### 3.5 `package.json` 变更

前端 `package.json` 新增脚本：
```json
{
  "scripts": {
    "upload-apk": "node ../scripts/upload-apk.js"
  }
}
```

---

## 4. 边界条件与异常处理

| 场景 | 处理方式 |
|------|---------|
| 网络断开 / 超时（10s） | `checkVersion` 返回 null，静默跳过（不弹窗，不阻塞 App 正常使用） |
| Supabase API 返回 500 | 同上，静默跳过 |
| 版本号对比失败（格式异常） | `console.warn` + 静默跳过 |
| 下载中断（网络波动） | XHR `onerror` → 显示"下载失败，请检查网络" + [重试] 按钮 |
| 下载速度极慢 | 进度条实时展示百分比（XHR onprogress），用户感觉有反馈 |
| Blob 内存问题（Android WebView 低版本） | 下载完成后立即写入 Filesystem 并释放 Blob 引用；4MB 文件在 Chromium WebView（Android 5.0+）已验证安全 |
| 写入文件系统失败（权限/空间不足） | 捕获异常 → 显示"存储空间不足，请清理后重试" |
| 调起系统安装器失败 | 显示"无法打开安装器，请手动安装" + 提示 APK 路径 |
| 用户点安装后系统弹窗点"取消" | 由 Android 系统接管，本次"已下载"状态结束。下次打开 App 时版本检测仍然运行，会再次提示升级 |

### 流控与防御

- 版本检测只在 **App 启动时执行一次**，不做定时轮询
- 下载中用户关闭弹窗 → 不允许（按钮 disabled 或弹窗不可关闭）
- 同一版本不做本地缓存判断（每次启动都检测，确保及时获取最新版本）

---

> **生成时间**：2026-07-30  
> **生成方式**：/grill-me 五轮架构盘问 → /to-spec 增量追加  
> **关联模块**：`frontend/src/services/upgrade.ts`（待创建）、`supabase::app_versions`（待创建）、`scripts/upload-apk.js`（待创建）
