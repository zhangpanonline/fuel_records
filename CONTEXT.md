# SmartFAB 预测引擎

SmartFAB 的智能预测子系统，基于用户行为上下文预测下一步最可能的操作，并在悬浮按钮上呈现。

## Language

**预测引擎 (Prediction Engine)**: 运行在浏览器本地的规则-频次混合系统，接收上下文快照，输出优先级排序的动作列表。
_Avoid_: AI / 推荐系统 / 智能推荐

**规则 (Rule)**: 一条 `上下文条件 → 动作` 的映射，带有一个动态权重。规则可由开发者预置（种子规则）或由系统从用户行为中自动提取（生成规则）。
_Avoid_: policy / 策略

**上下文 (Context)**: 预测引擎做出判断时所依赖的当前状态快照，包括页面路由、数据状态、时间特征等。
_Avoid_: state / 状态

**动作 (Action)**: FAB 可执行的任意操作单元——导航跳转、滚动到顶、切换图表类型、聚焦输入框、一键记一笔、展开筛选面板等。
_Avoid_: behavior / 行为

**冷启动 (Cold Start)**: 新用户或新设备上系统仅有种子规则、尚无用户行为历史的初始阶段。
_Avoid_: bootstrap

**种子规则 (Seed Rule)**: 开发者预置的初始规则，保证冷启动阶段预测引擎有基本的行为判断能力。种子规则可被淘汰（阈值：权重 ≤ -5）。
_Avoid_: default rule / 默认规则

**生成规则 (Generated Rule)**: 系统从用户行为日志中自动提取的规则。生成阈值：7 天内同一 `(上下文, 动作)` 出现 ≥ 3 次。
_Avoid_: learned rule / 自动规则

**临时规则 (Temporary Rule)**: 用户首次做出某个 `(上下文, 动作)` 组合时创建的权重 = 1 的暂存规则，尚未达到生成阈值。7 天未再命中即删除。
_Avoid_: pending rule

**上下文快照 (Context Snapshot)**: 预测引擎在某个时刻采集的完整信号集合，包含页面路由、今日记录数、当前小时、星期几、图表类型、是否全屏、编辑模式等。
_Avoid_: context state

**行为日志 (Behavior Log)**: 每次 FAB 点击事件的持久化记录，包含时间戳、上下文快照、用户选择的动作、是否命中预测。存储在 localStorage，用于规则自动生成和权重更新。
_Avoid_: event log / analytics

**权重 (Weight)**: 每条规则的动态分值。命中 +1，预测错误（用户选了其他动作）-1。权重决定预测优先级：同一上下文中权重最高的规则胜出。
_Avoid_: score / priority

**置信度 (Confidence)**: 最高权重规则与第二高权重规则的分值差。差值越大越确定。高置信度时 FAB 使用增强脉冲动效。
_Avoid_: certainty

**备选菜单 (Alternative Menu)**: 用户长按 FAB 时弹出的动作列表，包含预测动作（置顶高亮）+ 其他可用的动作选项。作为预测失误的安全网。
_Avoid_: overflow menu / context menu

**动作执行器 (Action Executor)**: 每个 Action 类型对应的 `execute()` 函数，由预测引擎通过 PredictionContext 下发，当前活跃页面组件响应执行。
_Avoid_: handler / dispatcher
