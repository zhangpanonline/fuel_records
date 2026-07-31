# App 版本更新检测与安装 — 任务拆解清单

> 基于 [upgrade.md](file:///Users/zp/Code/fuel_records/frontend/src/services/upgrade.md) 规格书拆分，原子任务按依赖顺序排列。

---

## 依赖关系图

```
Ticket 1 (Supabase 表+存储) ──┐
                              ├──→ Ticket 3 (upgrade.ts 服务)
Ticket 2 (vite 版本注入) ────┘        │
                                      └──→ Ticket 4 (App 弹窗 UI)
                                               │
                                               └──→ Ticket 6 (边界防御+权限)

Ticket 5 (发版脚本) ─── 独立，无依赖
```

---

## 任务列表

- [x] **Ticket 1: Supabase 基础设施 — 版本表 + RLS + Storage**
  - **依赖**：无
  - **任务**：
    1. 在 Supabase Dashboard → SQL Editor 中执行建表 SQL，创建 `app_versions` 表（`id, version_code, version_name, apk_url, release_notes, created_at`）
    2. 开启 RLS（`ALTER TABLE app_versions ENABLE ROW LEVEL SECURITY`）
    3. 创建匿名读取策略（`CREATE POLICY "anon can read app_versions" ON app_versions FOR SELECT TO anon USING (true)`）
    4. 在 Supabase Storage 中创建 public bucket `apk`
    5. 验证：浏览器访问 `https://<project>.supabase.co/rest/v1/app_versions?order=version_code.desc&limit=1`，带上 `apikey` 头，确认返回空数组 `[]`

- [x] **Ticket 2: 前端版本号注入 — vite.config.ts**
  - **依赖**：无
  - **任务**：
    1. 修改 `frontend/vite.config.ts`：导入 `package.json`，通过 `define` 将 `pkg.version` 注入为 `import.meta.env.VITE_APP_VERSION`
    2. 验证：在 `App.tsx` 临时 `console.log(import.meta.env.VITE_APP_VERSION)`，确认打印出当前版本号

- [x] **Ticket 3: 升级检测服务 — frontend/src/services/upgrade.ts**
  - **依赖**：Ticket 1（Supabase 就绪）、Ticket 2（版本号可读取）
  - **任务**：
    1. 新建 `frontend/src/services/upgrade.ts`
    2. 实现 `getLatestVersion()`：用 `fetch` 请求 Supabase REST API，返回最新 `{version_code, version_name, apk_url}` 或 `null`
    3. 实现 `checkUpdate()`：对比 `import.meta.env.VITE_APP_VERSION` 与 `version_code`（暂用 `version_code > 当前对应的 code` 逻辑，当前 App 的 version_code 硬编码 `1` 起步），返回 `{hasUpdate, version_name, apk_url}` 或 `null`
    4. 实现 `downloadApk(apkUrl: string, onProgress: (pct: number) => void): Promise<string>`：用 `XMLHttpRequest` 下载 APK，`onprogress` 回调百分比，完成后用 `@capacitor/filesystem` 的 `writeFile` 写入设备，返回本地文件路径
    5. 实现 `installApk(localPath: string): Promise<void>`：通过 Capacitor 插件或原生 Intent 调起系统安装器
    6. 导出类型 `UpdateInfo`
    7. 验证：在 App.tsx 临时调用 `checkUpdate()` 并 console.log 结果

- [x] **Ticket 4: 升级弹窗 UI — App.tsx 集成**
  - **依赖**：Ticket 3（upgrade.ts 可用）
  - **任务**：
    1. 在 `App.tsx` 新增 `useEffect`：组件挂载时调用 `checkUpdate()`
    2. 新增状态：`updateInfo`（弹窗数据）、`downloadProgress`（0-100 或 null）、`downloadError`（错误信息）
    3. 实现"发现新版本"弹窗：显示当前/最新版本号 + [暂不更新] / [立即更新] 两个按钮，无 [x] 关闭
    4. 点击 [立即更新]：调用 `downloadApk()`，弹窗内切换为进度条模式（百分比 + 横向进度条）
    5. 下载完成后：调用 `installApk()` 调起系统安装器
    6. 下载失败：显示错误信息 + [重试] 按钮
    7. 弹窗 CSS：居中模态框，玻璃态风格（与现有 App.css 风格一致），半透明遮罩

- [x] **Ticket 5: 发版自动化脚本 — scripts/upload-apk.js**
  - **依赖**：Ticket 1（Supabase Storage 就绪）
  - **任务**：
    1. 新建 `scripts/upload-apk.js`（项目根目录）
    2. 使用 `@supabase/supabase-js` SDK（Service Role Key 从环境变量 `SUPABASE_SERVICE_KEY` 读取）
    3. 读取前端 APK 构建产物，上传到 Supabase Storage bucket `apk`（`upsert: true` 覆盖）
    4. 获取公开 URL，查询当前最大 `version_code`，INSERT 新行到 `app_versions`
    5. 在 `frontend/package.json` 添加 `"upload-apk": "node ../scripts/upload-apk.js"` 脚本
    6. 验证：`npm version patch && npm run build:apk && node ../scripts/upload-apk.js` 完整链路跑通

- [x] **Ticket 6: 边界防御与 Android 权限**
  - **依赖**：Ticket 3、4（升级流程完整）
  - **任务**：
    1. `getLatestVersion()` 加 10s 超时（`AbortController`），超时/网络错误 → 返回 `null`，静默跳过
    2. Supabase 返回非 200 → 返回 `null`，静默跳过
    3. `downloadApk()` XHR `onerror` → reject，由 UI 层捕获显示错误
    4. `installApk()` 捕获权限/文件系统异常 → reject，UI 显示友好提示
    5. Android 权限：检查 `AndroidManifest.xml` 是否需要添加 `REQUEST_INSTALL_PACKAGES`（Android 8.0+），如需要则补充
    6. 下载中弹窗不可关闭（阻止用户中途取消）
    7. 验证：断网启动 App → 无弹窗、正常使用；下载中关 WiFi → 显示错误 + 重试按钮
