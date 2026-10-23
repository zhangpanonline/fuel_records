# ADR-004 — 双数据库引擎 + 双服务器运行时切换

两个痛点催生了这套组合：① 需要一个"沙箱"环境测试新功能与 E2E 流程，但不能污染正式数据；② Render 免费层 15 分钟无请求即休眠，冷启动 5–15 秒。解法是后端同时维护正式/测试两个 SQLAlchemy 引擎（P11），并在 Render 之外部署 Fly.io（东京节点，不休眠）作为线上主力。

**决策**：
- **双库**：`prod_engine` + `test_engine`，按请求头 `X-Database-Env: prod|test` 运行时选库；切换后清空 token 需重新登录
- **双服务器**：Render 与 Fly.io 共用同一 `JWT_SECRET` 与同一 Supabase，token 互通——运行时切换服务器**无需重新登录**（先健康检查验证再切换）；Fly.io 为默认/主力，Render 备用
- 前端 axios 请求拦截器动态设置 `baseURL` + `X-Database-Env` 头，服务器 × 数据库共 4 种组合

**Considered Options**：
- 只留 Fly.io 单服务器——失去 Render 备用（Fly.io 故障时无退路）
- 测试环境独立部署一个 App——维护两套前端安装包，成本高

**Consequences**：
- 发版脚本与 App 端必须保证 `version_code` 一致性（见 ADR-005）
- `.env.production` 的 `VITE_API_BASE_URL` 仅作兜底，实际 baseURL 由拦截器动态决定
- 测试规格书硬性规定：线上测试必须用测试库，任何情况下不许直连生产库

**关联文档**：`README.md` Phase 11 · `SPEC/PERF_SPEC.md` §3.2 · `test-specs/test-prerequisites.md`
