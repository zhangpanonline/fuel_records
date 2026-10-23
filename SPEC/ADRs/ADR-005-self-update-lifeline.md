# ADR-005 — 自动更新生命线：公式化 version_code + Supabase 分发

App 通过 APK 直接安装、无应用商店分发渠道。自动更新一旦失效，用户将永久停留在旧版本且开发者无法触达——这是本 App 的**生命线功能**。分发链路：APK 存 Supabase Storage public bucket，版本记录存 `app_versions` 表（RLS 允许匿名 SELECT），App 启动时查询最新版本、数值比较后弹窗 → XHR 带进度下载 → 原生 FileProvider 插件调起系统安装器。

**决策**：`version_code` 由版本号公式 `MAJOR×10000 + MINOR×100 + PATCH` 推导，发版脚本与 App 端各自从 `package.json` 计算同一 code；构建 **release 签名包**（脚本写入 `android/version.properties` 供 Gradle 读取）。

**Considered Options**：
- `max(version_code)+1` 递增编号（upgrade.md 旧方案）——已废弃：版本号跨位时失效（0.0.9 → 0.1.0 时库中 code=10，而新包内置 code=100，比较逻辑永不触发更新）
- 公式推导 ✅ ——发布端与客户端天然一致

**Consequences**：
- **硬性规则**：修改 `frontend/src/services/upgrade.ts`、`App.tsx` 的 checkUpdate 调用、`vite.config.ts` 版本注入、`scripts/upload-apk.js`、Supabase `app_versions`/Storage 前，必须征得用户明确同意（文件清单见 e2e 测试规格书"自动更新保护章节"）
- 版本检测失败（断网/超时）一律静默跳过，绝不阻塞 App 使用

**关联文档**：`SPEC/upgrade.md` · `test-specs/e2e-test-spec.md` Journey 9 · `SPEC/GLOSSARY.md`（version_code）
