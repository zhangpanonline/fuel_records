# Fuel Records — 功能测试清单

> 每次完成一个 Phase 后，补充对应的测试用例。测试时从 Phase 1 按顺序跑到最新 Phase，防止回归。

---

## 测试环境说明

> [!CAUTION]
> **线上手动测试必须使用测试数据库（`postgresql_test`），禁止碰生产数据库。**
> 生产数据库（`DB_PG_URL`）仅用于 Render 部署环境，不在本地或其他环境直连测试。

### 本地环境
- 后端: `http://localhost:8000`
- 使用 SQLite (`DB_TYPE=sqlite`)，文件 `backend/fuel_records.db`
- 或使用测试数据库 `DB_PG_URL_TEST`

### 线上测试环境
- 后端: `https://fuel-records.onrender.com`
- 数据库切换: App 内部设置弹窗 → 正式库 / 测试库 radio，切换后自动重新登录
- 正式库 → `DB_PG_URL` (Supabase 生产项目)
- 测试库 → `DB_PG_URL_TEST` (Supabase 测试项目 `fuel-records-test`)

### 测试账号约定

> [!IMPORTANT]
> **业务功能测试尽量使用固定账号 `zp` / `zp1992`**，除非测试的是注册/登录/鉴权等账号创建相关功能。
>
> 原因：手动测试时需要在这个账号下查看历史数据，用同一个账号能积累数据，方便验证数据增长和统计功能。
>
> | 测试场景 | 使用账号 |
> |---------|---------|
> | 加油记录 CRUD、油耗统计、多车管理 | `zp` / `zp1992` |
> | 记账支出 CRUD、分类管理、统计图表 | `zp` / `zp1992` |
> | 下拉刷新、骨架屏、统计卡片 | `zp` / `zp1992` |
> | 自动更新功能测试 | `zp` / `zp1992` |
> | 注册/登录/鉴权/Token 过期 | 新建临时账号 |
> | 数据隔离验证（A 不能看 B 的数据） | 新建临时账号 B |
>
> 如果 `zp` 账号在测试库中不存在，需先创建：`POST /api/v1/auth/register` → `{"username":"zp","password":"zp1992"}`

### 线上生产环境
- 后端: `https://fuel-records.onrender.com`
- 数据库: Supabase 生产项目，`DB_TYPE=postgresql`
- **仅 Render 部署自动使用，严禁本地手动连接**

### 测试前准备

```bash
# 本地 SQLite 测试（日常开发）
rm -f backend/fuel_records.db
cd backend && source .venv/bin/activate && uvicorn main:app --host 0.0.0.0 --port 8000 &
cd ..
BASE="http://localhost:8000/api/v1"
```

```bash
# 线上测试库（需要真数据验证时）
# 1. 修改 backend/.env: DB_TYPE=postgresql_test
# 2. 确保 DB_PG_URL_TEST 已配置测试 Supabase 项目连接串
# 3. 启动后端同上
# 注意: 测试库和生产库完全隔离，可随意增删改
```

---

## Phase 1 — 健康检查

- [ ] `GET /api/v1/health` 返回 `{"status":"ok","version":"1.0.0"}`

---

## Phase 4 — 用户鉴权

### 用户注册

- [ ] 正常注册 → 返回 JWT token
- [ ] 重复用户名 → 返回 400 "已被注册"
- [ ] 密码不足 6 位 → 返回 422

### 用户登录

- [ ] 正确密码 → 返回 JWT
- [ ] 错误密码 → 返回 400 "用户名或密码错误"
- [ ] 不存在用户 → 返回 400 "用户名或密码错误"

### 鉴权拦截

- [ ] 无 Token 访问 `/records` → 401
- [ ] 无效 Token → 401

---

## Phase 5 — 多车管理

### 车辆 CRUD

- [ ] 创建车辆 → 返回 Vehicle 对象
- [ ] 获取车辆列表 → 返回当前用户的车辆
- [ ] 修改车辆名称 → 成功
- [ ] 删除无记录的车辆 → 成功
- [ ] 删除有关联记录的车辆 → 返回 400 错误

### 创建加油记录（含 vehicle_id）

- [ ] 创建第一条记录 → `is_baseline: true`，`fuel_consumption: null`
- [ ] 创建第二条记录 → 自动计算油耗
- [ ] 使用不存在的 vehicle_id → 400 "车辆不存在"
- [ ] 里程倒退 → 400 "里程数不能低于上一条记录"
- [ ] 无 vehicle_id → 422 校验错误
- [ ] 加满油箱 toggle 默认开启，可切换
- [ ] 备注输入支持历史联想（datalist 下拉），可选已有备注快速填入
- [ ] 创建含 `is_full_tank=false` 的记录 → 字段正确保存
- [ ] 创建含 `note` 的记录 → 字段正确保存

### 按车辆筛选记录

- [ ] `?vehicle_id=1` 只返回该车辆的记录
- [ ] 不同车辆的记录互不干扰

### 数据隔离

- [ ] 用户 A 只能看到自己的车辆
- [ ] 用户 A 只能看到自己的记录
- [ ] 用户 B 不能修改 A 的记录
- [ ] 用户 B 不能删除 A 的记录
- [ ] 用户 B 不能替 A 的车创建记录

### 修改与删除（含车辆维度）

- [ ] 修改记录 → 级联重算该车辆后续油耗
- [ ] 删除基线记录（该车唯一）→ 400 错误
- [ ] 删除中间记录 → 级联重算
- [ ] A 修改自己的记录不影响 B 的油耗

### 前端验证

- [ ] 登录后显示车辆选择器下拉框
- [ ] 首次使用提示添加车辆
- [ ] 添加车辆后自动选中
- [ ] 切换车辆 → 列表刷新为新车辆的记录
- [ ] 刷新页面后记住上次选择的车辆（localStorage）
- [ ] 创建记录自动带当前车辆 ID

---
## Phase 6 — 数据之美

### 统计汇总

- [ ] `GET /api/v1/stats/summary?vehicle_id=X` 返回 record_count / total_mileage / total_fuel_volume / total_fuel_cost / avg_consumption / avg_unit_price
- [ ] 有记录的车辆返回完整统计数据
- [ ] 无记录的车辆返回 record_count=0

### 月度统计

- [ ] `GET /api/v1/stats/monthly?vehicle_id=X&year=2026` 返回按月份分组的加油统计
- [ ] 返回结构含 year + months 数组，每月含 count / total_volume / total_cost / avg_consumption

### 记录筛选

- [ ] `?start_date=2026-01-01&end_date=2026-12-31` 按日期范围筛选
- [ ] `?is_full_tank=true` 筛选加满的记录
- [ ] `?is_full_tank=false` 筛选未加满的记录
- [ ] `?note=中石化` 按备注模糊搜索

### 前端验证

- [ ] 右下角显示 📊 FAB 按钮，点击弹出统计面板
- [ ] 统计面板含车辆选择器 + 统计卡片（总里程、平均油耗、总花费、总加油量）
- [ ] 统计面板含年份选择器 + 月度油耗趋势折线图（油耗 + 花费双轴）
- [ ] 统计面板含月度明细表
- [ ] 筛选与加油提醒合并在同一行，左为"每周加油提醒" toggle，右为"筛选"按钮
- [ ] 筛选有红点提示当前激活的筛选条件
- [ ] 应用筛选后列表按条件过滤
- [ ] 清除筛选后恢复全部记录

---
## Phase 10 — 个人记账

### 分类管理 API

- [ ] `POST /api/v1/expenses/categories` 创建一级分类（无 parent_id）→ 201，level=1
- [ ] `POST /api/v1/expenses/categories` 创建二级分类（指定 parent_id）→ 201，level=2
- [ ] `POST /api/v1/expenses/categories` 创建三级分类 → 201，level=3
- [ ] `POST /api/v1/expenses/categories` 尝试创建 level=4 → 400
- [ ] `POST /api/v1/expenses/categories` 同名同级 → 409
- [ ] `GET /api/v1/expenses/categories` 返回用户分类树（含 children 嵌套）
- [ ] `PUT /api/v1/expenses/categories/{id}` 修改名称 → 成功
- [ ] `PUT /api/v1/expenses/categories/{id}` 不传 parent_id（禁止改层级）→ 校验通过
- [ ] `DELETE /api/v1/expenses/categories/{id}` 删除无子分类无记录的 → 204
- [ ] `DELETE /api/v1/expenses/categories/{id}` 有子分类 → 400
- [ ] `DELETE /api/v1/expenses/categories/{id}` 有关联记录 → 400

### 支出记录 API

- [ ] `POST /api/v1/expenses` 创建支出（完整三级分类）→ 201
- [ ] `POST /api/v1/expenses` 无效分类链（L1→L2→L3 不匹配）→ 400
- [ ] `POST /api/v1/expenses` 金额 ≤ 0 → 422
- [ ] `GET /api/v1/expenses` 分页返回（page + page_size）→ items + total
- [ ] `GET /api/v1/expenses?start_date=...&end_date=...` 日期筛选
- [ ] `GET /api/v1/expenses?category_l1=餐饮` 按一级分类筛选
- [ ] `PUT /api/v1/expenses/{id}` 修改金额/备注 → 200
- [ ] `PUT /api/v1/expenses/{id}` 尝试改到不存在的分类 → 400
- [ ] `DELETE /api/v1/expenses/{id}` 删除 → 204
- [ ] `DELETE /api/v1/expenses/{id}` 删除不存在的记录 → 404

### 统计 API

- [ ] `GET /api/v1/expenses/stats?start_date=...&end_date=...&group_by=none` 返回 total_amount / record_count / avg_daily + category_breakdown 扁平列表
- [ ] `GET /api/v1/expenses/stats?group_by=month` 返回 items 数组（含 period + total + breakdown）
- [ ] `GET /api/v1/expenses/stats?group_by=none&category_l1=餐饮` 按分类过滤统计

### 数据隔离

- [ ] 用户 A 创建分类 → 用户 B 看不到
- [ ] 用户 A 创建支出 → 用户 B 看不到
- [ ] 用户 B 不能修改 A 的支出
- [ ] 用户 B 不能删除 A 的支出
- [ ] 用户 B 不能修改 A 的分类

### 全局导航

- [ ] 底部导航双 Tab：油耗 / 记账，点击切换页面
- [ ] 顶栏顶到头 + 宽度占满屏幕，不被手机状态栏遮挡（safe-area-inset-top）
- [ ] 顶栏标题跟随当前 Tab 自动切换（油耗 / 记账）
- [ ] 顶栏右侧：主题切换 + ⚙ 设置齿轮按钮
- [ ] 主题切换（亮色/暗色/自动）两个 Tab 共享状态
- [ ] 点击设置齿轮打开 SettingsModal
- [ ] `/` 自动重定向到 `/expense`
- [ ] `/login` 页面不显示导航栏

### 记账主页

- [ ] 金额输入大号 `¥` 前缀，移动端弹出数字键盘
- [ ] 三级分类级联选择器（L1→L2→L3）正常联动
- [ ] 选择器末尾"+ 新建"弹出快速创建弹窗
- [ ] 冷启动（无分类）显示"创建你的第一个分类"引导
- [ ] 日期默认当天，可修改
- [ ] 提交按钮正常创建记录 → 列表刷新
- [ ] 编辑按钮 → 回填表单 → 按钮变"更新记录"
- [ ] 删除按钮 → confirm → 记录消失
- [ ] 左滑删除需长按约 0.5 秒后激活（防误触），激活时手机震动反馈
- [ ] "加载更多"按钮加载下一页
- [ ] 列表为空显示"还没记过账"
- [ ] 编辑态选中项 accent 色边框高亮
- [ ] 同日期记录无边框自然分隔，仅通过 28px 留白 + 日期标签区分

### 记账统计页 — 分类管理（内联折叠）

- [ ] 分类树形展示（一级→二级→三级），`├──`/`└──` 线段可视化层级（tree 命令风格）
- [ ] 重命名：点击分类 → CategoryModal 弹框，输入新名称后确认
- [ ] 添加子分类：每个节点下方始终显示"+ 添加N级分类"按钮，CSS 虚线延伸至按钮
- [ ] 添加同级分类：弹框中选择"添加同级分类"，自动挂到同一父级下
- [ ] 添加分类按钮层级对齐：一级靠左/二级居中/三级靠右
- [ ] 根级别不显示首个 `│` 竖线（第一列清理）
- [ ] 竖线间距统一为 1 空格，空位为 2 空格
- [ ] 删除分类：有子分类 → 提示"先删除子分类"

### 记账统计页

- [ ] 汇总卡片：总支出 / 笔数 / 日均，带彩色顶部装饰线（与油耗统计对齐）
- [ ] 日期范围：自由选择开始/结束日期 + 近一年/近一月/近一周快捷按钮
- [ ] 修改日期范围不刷新页面，仅数据更新（无闪烁）
- [ ] 饼图：一级分类占比，带引导线（名称+百分比标签）
- [ ] 饼图下钻："其他"归并（<5% 聚合为灰色扇区）+ 点击"其他"展开被隐藏项 + 递归下钻至三级
- [ ] 饼图图例：下方 2 列网格，每项显示色块 + 名称 + 占比 + 金额，点击可下钻
- [ ] 图表全屏：右上角 ⛶ 按钮 → 全屏铺满 → ✕ 关闭；全屏时点击 SmartFAB 自动关闭全屏
- [ ] 柱状图全屏：水平条形图（layout="vertical"），底部横向图例，手机横屏拿时自然填充
- [ ] 堆叠柱状图下钻：默认 L1 分色堆叠 → 点击图例项 → 下钻至 L2 → 再次点击 → L3，← 返回逐级退回，全屏同步
- [ ] 旭日图已移除（仅保留饼图和柱状图）
- [ ] 无数据时图表区域显示占位提示

---
## Phase 10.6 — 体验增强

### 记账六区间统计

- [ ] `GET /api/v1/expenses/multi_summary` 返回 6 个区间累计金额（current_year/month/week + recent_year/month/week）
- [ ] 无数据时各字段返回 `"0.00"`
- [ ] 近一年不含起始日（12 个月前当天不纳入统计）
- [ ] 当周从周一算起至今天
- [ ] 记账页统计卡片两行三列布局，上方金额下方标签
- [ ] 新增/编辑/删除后卡片金额自动刷新
- [ ] 统计卡片无骨架屏（P10.6 明确要求）

### 油耗页累计统计下拉框

- [ ] 筛选按钮同行左侧显示自定义下拉框，与车辆选择器同款毛玻璃样式
- [ ] 三种选项：当年累计/当月累计/自上月累计（油耗+金额）
- [ ] 选中后展示纯数字 `88.88L / 888.88¥`
- [ ] 展开选项有完整文字说明（如"当年累计油耗/当年累计金额"）
- [ ] 下拉三角 SVG 图标，与车辆选择器大小一致
- [ ] 下拉选项不被下方记录卡片遮挡（z-index: 200）
- [ ] 选项宽度自适应内容（min-width + width: max-content）
- [ ] 新增/编辑/删除记录后累计值自动刷新
- [ ] 选择偏好持久化到 localStorage key `fuel_summary_mode`
- [ ] 重新进入页面恢复上次选择

### 下拉刷新

- [ ] 油耗页顶部下拉 → 旋转 spinner 出现 → 刷新记录 + 统计
- [ ] 记账页顶部下拉 → 旋转 spinner 出现 → 刷新记录 + multi_summary
- [ ] 仅页面滚动到顶部时触发（window.scrollY ≈ 0）
- [ ] 页面滚动到中间时下拉不触发刷新（正常滚动）
- [ ] 横向滑动（左滑删除）不误触下拉刷新
- [ ] 刷新期间显示对应页面骨架屏

### 页面骨架屏

- [ ] 记账页首次加载显示 ExpensePageSkeleton（金额→分类→日期→6卡片→4记录）
- [ ] 油耗页首次加载显示 FuelPageSkeleton（车辆栏→表单→统计行→4记录）
- [ ] 骨架屏占满全屏（min-height: 100vh）
- [ ] 骨架屏有条形闪动动画（shimmer）
- [ ] 数据加载完成后骨架屏切换为真实内容
- [ ] 下拉刷新也展示骨架屏

### SmartFAB 智能浮动按钮

- [ ] 路由感知：油耗/记账主页 → 跳转对应统计页，统计页 → 返回主页
- [ ] 可全屏任意位置拖拽（包括拖到 TopBar/BottomNav 上方）
- [ ] 拖拽位置持久化 localStorage，重新进入恢复
- [ ] 按钮始终可点击，不被其他元素遮挡（z-index: 10001，覆盖全屏遮罩层）
- [ ] 统计页全屏图表时，点击 FAB 仅关闭全屏，不触发路由跳转

### 底部导航调整

- [ ] Tab 顺序为记账第一、油耗第二
- [ ] 默认路由 `/` 跳转 `/expense`
- [ ] Tab 切换不重新请求数据（DataProviders 合并）

---
## 设置弹窗与双数据库切换（P11）

### 设置弹窗入口

- [ ] 顶栏右侧 ⚙ 齿轮按钮（font-size 18px，与 🌓 主题按钮等大），点击打开 SettingsModal
- [ ] 登录页标题栏右侧也显示 ⚙ 齿轮按钮，点击同样打开 SettingsModal
- [ ] 顶栏不再直接显示"退出登录"按钮

### 设置弹窗 — 账户区域

- [ ] 显示当前登录用户：用户名前缀单字圆圈 + 用户名
- [ ] 首次打开优先展示 localStorage 缓存的用户信息，同时后台静默刷新 `/me`
- [ ] 后台刷新完成后自动更新展示
- [ ] 当前数据库标识展示（正式库/测试库 tag）
- [ ] 底部"退出登录"按钮：点击清空 token + 跳转登录页

### 设置弹窗 — 版本区域

- [ ] 显示当前版本号（如 `v0.0.x`）
- [ ] "检查更新"按钮：始终请求生产 Supabase `app_versions` 表（不受数据库切换影响）
- [ ] 有新版本 → 弹窗提示下载
- [ ] 已是最新 → 提示"已是最新版本"

### 设置弹窗 — 数据库切换

- [ ] 正式库 / 测试库 radio 按钮，默认选中当前库
- [ ] 点击切换 → 先弹出确认对话框"切换后将重新登录，是否继续？"
- [ ] 确认后先调 `GET /api/v1/health/db` 验证目标库可用性
- [ ] 验证中显示 toast "验证中…"（紫色）
- [ ] 验证成功 → toast "已切换至测试/正式数据库"（绿色）→ 清空 token → 跳转登录页
- [ ] 验证失败 → toast "数据库连接失败，请稍后重试"（红色）→ 保持在当前库

### 双数据库架构

- [ ] 后端 `database.py` 维护 `prod_engine` + `test_engine` 双引擎
- [ ] `GET /api/v1/health/db` 按 `X-Database-Env` 头验证连接
- [ ] 前端 axios 拦截器自动添加 `X-Database-Env: prod|test` 头
- [ ] `localStorage` key `db_env` 持久化用户选择，默认 `prod`
- [ ] `init_db()` 对两个库同时执行迁移
- [ ] Render 部署需配置 `DB_PG_URL_TEST` 环境变量（测试 Supabase 项目连接串）

---
## 自动更新功能 — 最高优先级保护

> [!CAUTION]
> **自动更新是本 App 的"生命线"——这可能是整个项目最重要的功能，没有之一。**
>
> **为什么不能出问题**：App 通过 APK 直接安装到用户手机，没有应用商店分发渠道。一旦自动更新功能被破坏：
> - 用户无法获取新版本，永远停留在当前版本
> - 用户联系不到开发者，不知道去哪下载新版本
> - 开发者没有用户的联系方式，无法主动通知
> - **结果**：我们永久失去对该用户的远程更新能力，该用户成为"僵尸用户"
>
> **硬性规则**：
> 1. **每次修改任何代码后，必须验证自动更新功能无回归**
> 2. **修改自动更新逻辑/行为前，必须停止并向用户说明修改原因和影响范围，获得明确同意后才能继续**
>    - ⚠️ 例外：仅修改 `CURRENT_VERSION_CODE`（随 `npm version` 自然递增，无行为变更）无需征得同意
> 3. **任何涉及以下文件/服务的行为变更都属于自动更新相关，同样需要征得同意**：
>    - `frontend/src/services/upgrade.ts`（核心检测/下载/安装逻辑 — 仅更新 `CURRENT_VERSION_CODE` 除外）
>    - `frontend/src/App.tsx` 中的 `useEffect(checkUpdate)` 调用
>    - `frontend/vite.config.ts` 中的 `VITE_APP_VERSION` 注入
>    - `frontend/package.json` 中的 `version` 字段（随 `npm version` 自然递增无需同意）
>    - `scripts/upload-apk.js`（发版脚本）
>    - Supabase `app_versions` 表（RLS 策略 / 表结构）
>    - Supabase Storage `apk` bucket（公开访问权限）
>    - `frontend/src/pages/LoginPage.tsx` 中的版本号显示
> 4. **构建 APK 后必须完成以下测试才能视为发版就绪**

### 自动更新功能测试

- [ ] `vite.config.ts` 正确注入 `VITE_APP_VERSION = package.json version`
- [ ] `checkUpdate()` 能正常请求 Supabase `app_versions` 表（anon key + RLS 可读）
- [ ] 线上 `app_versions` 表最新 `version_code` > APK 内置 `CURRENT_VERSION_CODE` → 弹窗出现
- [ ] 线上 `app_versions` 表最新 `version_code` <= APK 内置 `CURRENT_VERSION_CODE` → 静默跳过（无弹窗）
- [ ] 版本检测网络超时/失败 → 静默跳过，不阻塞 App 正常使用（不弹窗、不报错）
- [ ] Supabase `app_versions` 表 RLS 策略有效：匿名用户可 SELECT
- [ ] Supabase Storage `apk` bucket 为 public，APK 文件可公开下载
- [ ] 弹窗「暂不更新」→ 关闭弹窗，正常使用
- [ ] 弹窗「立即更新」→ 显示下载进度条
- [ ] 下载完成 → 调起系统安装器
- [ ] 下载失败 → 显示错误提示 + 重试按钮
- [ ] 登录页底部显示版本号（如 `v0.0.x`）
- [ ] 退回到旧版本 APK 安装后，启动时能检测到新版本并弹窗
- [ ] `npm version patch && npm run build:apk` 构建的 APK 内置版本号正确递增
- [ ] `scripts/upload-apk.js` 能成功上传 APK 到 Supabase Storage + INSERT `app_versions` 表

---
## 已知坑位记录

### 本地 vs 线上差异

| 场景 | 本地 (SQLite) | 线上 (PostgreSQL) | 影响 |
|------|--------------|-------------------|------|
| `server_default=func.now()` | SQLite CURRENT_TIMESTAMP | PostgreSQL NOW() | 时区差异 |
| `unique=True` 对 NULL | 允许多个 NULL | 允许多个 NULL | email 无影响 |
| 连接池 | 无 | 自动连接池 | 线上并发更好 |

### Phase 4 踩坑

1. **passlib 与 bcrypt 5.0 不兼容** → 降级 bcrypt 到 4.x
2. **recaculate_consumption 未过滤 user_id** → 修复加 user_id 参数

### Phase 5 踩坑

1. **delete_record 基线保护按全用户检查** → 改为按 vehicle_id 检查，防止用户有 A、B 两车时，删 A 的基线记录被 B 拦截
2. **create_all 不改已有表结构** → 添加 _migrate_add_column() 自动迁移 vehicle_id 列

### Phase 10 踩坑

1. **PostgreSQL `date_format()` 不存在** → 支出统计用 `to_char()` 替代，按 DB_TYPE 自动切换（sqlite → `strftime`，mysql → `date_format`，postgresql → `to_char`）

---

> **更新记录**
> - 2026-08-02: P11 新增 — 设置弹窗与双数据库切换测试清单（入口/账户/版本/数据库切换/双引擎架构 共 20+ 条测试）；同步更新分类管理（tree 线段 + CategoryModal 弹框）、移除旭日图、SmartFAB 全屏关闭/z-index 更新
> - 2026-08-01: 新增自动更新功能保护章节 — 最高优先级，硬性规则 + 15 条回归测试 + 关联文件清单
> - 2026-08-01: Phase 10.6 新增 — 体验增强测试清单（六区间统计 + 累计下拉框 + 下拉刷新 + 骨架屏 + 导航调整 共 30+ 条测试）
> - 2026-08-01: 同步近期 UI 变更 — 加油记录表单增加加满 toggle + 备注 + 历史联想 / 统计入口改为 FAB + 底部面板 / 筛选与提醒合并同行 / TopBar 全宽安全区域 + 动态标题 / 移除导出按钮
> - 2026-07-31: Phase 10 新增 — 个人记账模块测试清单（分类管理 / 支出记录 / 统计 / 数据隔离 / 全局导航 / 记账主页 / 底部面板 / 统计图表 共 40+ 条测试）
> - 2026-07-30: Phase 6 更新 — 统计汇总 API + 月度统计 API + 记录筛选 + 前端统计页面（卡片/折线图/明细表）+ 前端筛选面板
> - 2026-07-29: Phase 5 更新 — 车辆 CRUD + vehicle_id 关联 + 多车数据隔离测试用例
> - 2026-07-29: 初版，覆盖 Phase 1-4 所有功能测试 + 踩坑记录
