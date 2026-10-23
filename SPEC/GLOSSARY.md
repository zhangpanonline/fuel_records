# Fuel Records — 全项目术语表

> 本文件是 Fuel Records 全局领域术语表，覆盖油耗、记账、架构与发布四个域。SmartFAB 预测引擎的术语见项目根目录 [`CONTEXT.md`](../CONTEXT.md)（预测引擎 / 规则 / 上下文快照 / 行为日志 / 权重 / 置信度 / 备选菜单 / 冷启动 / 种子规则 / 生成规则 / 临时规则 / 动作执行器）。
>
> 关键设计决策见 [`ADRs/`](./ADRs/)。

---

## 油耗域

**加满记录 (Full-Tank Record)**：
`is_full_tank=true` 的加油记录。加满时加入的油量等于上次加满后烧掉的油量，因此只有加满记录能计算油耗。
_Avoid_: 满油记录、满箱记录

**未加满记录 (Partial Record)**：
`is_full_tank=false` 的加油记录。不计算油耗，仅记录金额与油量，仍参与里程校验和级联重算。
_Avoid_: 半箱加油、补油记录

**参考里程 (Reference Mileage)**：
计算加满记录油耗时使用的起点里程——上一条**加满记录**的里程；无加满历史时回退车辆初始里程（跳过中间未加满记录，见 ADR-001）。
_Avoid_: 基准里程、锚点里程、起算里程

**初始里程 (initial_mileage)**：
车辆创建时登记的起始/购入里程。作为该车的**永久隐式基线**：删除全部加油记录后依然存在，下次加油仍可计算油耗（见 ADR-002）。
_Avoid_: 首次里程、起始里程、基准里程

**基线记录 (Baseline Record)**：
该车辆的首条加油记录（`is_baseline=true`）。里程高于初始里程时仍计算油耗；里程等于初始里程时无行驶距离，油耗为空。
_Avoid_: 起始记录、锚点记录

**级联重算 (Cascade Recalculation)**：
修改或删除某条加油记录后，对该车辆其后所有记录重算基线标记与油耗。
_Avoid_: 联动计算、链式更新、重算级联

**里程严格递增**：
新记录里程必须高于紧邻上一条记录（含未加满记录）；首条记录不得低于车辆初始里程。
_Avoid_: 里程校验、里程合法性

**百公里油耗 (fuel_consumption)**：
单条记录的单位油耗：加油量 ÷（当前里程 − 参考里程）× 100，单位 L/100km。
_Avoid_: 平均油耗、油耗率、油耗值

---

## 记账域

**三级分类树 (Category Tree)**：
用户自定义的支出分类体系，固定 3 层（一级/二级/三级），自引用树结构（`parent_id`），每个用户拥有独立分类体系。
_Avoid_: 多级分类、层级分类、分类体系

**分类链 (Category Chain)**：
一条支出记录携带的 `category_l1 → l2 → l3` 三个分类名。创建/修改时后端校验其父子关系与用户归属；最多 3 层，禁止在三级下再建子分类。
_Avoid_: 分类路径、分类层级关系

**分类名快照 (Category Name Snapshot)**：
支出记录冗余保存创建时的分类名称，查询无需 JOIN 分类表；分类重命名**不**回写历史记录，历史保留创建时的名称（见 ADR-003）。
_Avoid_: 冗余分类、快照分类、分类副本

**六区间统计 (Six-Window Summary)**：
一次返回六个时间窗口的累计金额——当年（1月1日~今天）、当月（本月1日~今天）、当周（本周一~今天）、近一年（12个月前~今天，不含起始日）、近一月（30天前~今天）、近一周（7天前~今天）。
_Avoid_: 六卡片、多区间统计、六宫格

**下钻 (Drill-down)**：
图表从一级分类逐级展开到二级/三级：饼图点击扇区、柱状图点击图例，逐级返回。
_Avoid_: 钻取、穿透、逐级展开

**"其他"归并 (Others Merge)**：
饼图中占比 <5% 的分类合并为一个灰色"其他"扇区，点击可展开被隐藏的小分类。
_Avoid_: 其余合并、杂项归并

**日均支出 (avg_daily)**：
所选时间范围内的平均每天支出；单日查询时天数视为 1（避免除零）。
_Avoid_: 日均消费、日均金额

---

## 架构域

**双数据库引擎 (Dual DB Engines)**：
后端同时维护正式库（`DB_PG_URL`）与测试库（`DB_PG_URL_TEST`）两个 SQLAlchemy 引擎，按请求头运行时选择；测试库是用户的沙箱环境（见 ADR-004）。
_Avoid_: 双库、主从库、测试环境库

**数据库环境 (X-Database-Env)**：
HTTP 请求头，取值 `prod | test`，指示本次请求使用正式库或测试库。切换后需重新登录（token 清空）。
_Avoid_: DB 环境变量、库选择头

**双服务器 (Dual Servers)**：
Render 与 Fly.io 两个后端部署，共用同一 JWT_SECRET 与同一 Supabase，可在设置弹窗运行时切换且**无需重新登录**。Fly.io 为线上主力（东京节点、不休眠），Render 为备用（见 ADR-004）。
_Avoid_: 双活、主备服务器、多后端

**性能模式 (Performance Mode)**：
`data-performance` 属性开关（`full | reduced`），降级时关闭毛玻璃（backdrop-filter）与持续无限动画以减少手机发热，功能逻辑完全不变。
_Avoid_: 省电模式、低配模式、降级模式

**双 Context 数据保持 (DataProviders)**：
`FuelDataContext` + `ExpenseDataContext` 同时包裹油耗与记账路由，Tab 切换不重新请求数据。
_Avoid_: 全局状态、数据共享层

---

## 发布域

**自动更新 (Auto Update)**：
App 启动时查询 Supabase `app_versions` 最新版本 → 弹窗 → 下载 APK → 调起系统安装器的完整升级链路。App 无应用商店分发渠道，此功能是生命线，任何相关修改前必须征得用户同意（见 ADR-005 与 e2e 测试规格书"自动更新保护章节"）。
_Avoid_: 热更新、OTA、增量更新

**version_code**：
版本号的整数编码，公式 `MAJOR×10000 + MINOR×100 + PATCH`（如 0.1.15 → 115）。发版脚本与 App 端各自从 `package.json` 版本号推导同一 code 用于数值比较，二者必须一致（见 ADR-005）。
_Avoid_: build number、版本序号、递增编号

**发版脚本 (upload-apk.js)**：
一键发版流程：`npm version patch` → 按公式计算 version_code 并写入 `android/version.properties` → 构建 release 签名 APK → 上传 Supabase Storage → INSERT `app_versions` 表。
_Avoid_: 发布流水线、release pipeline、打包脚本

---

> **关联文档**：`CONTEXT.md`（SmartFAB 术语）· `README.md`（项目总规格书）· `SPEC/ADRs/`（架构决策）· `test-specs/`（测试规格书）
