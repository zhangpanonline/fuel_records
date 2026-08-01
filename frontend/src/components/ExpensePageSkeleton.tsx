import './ExpensePageSkeleton.css'

export default function ExpensePageSkeleton() {
  return (
    <div className="expense-skeleton">
      {/* 金额输入 */}
      <div className="sk-amount">
        <div className="sk-bar sk-amount-bar" />
      </div>

      {/* 分类选择器 */}
      <div className="sk-category">
        <div className="sk-bar sk-category-bar" />
      </div>

      {/* 日期/备注 */}
      <div className="sk-row2">
        <div className="sk-bar sk-half" />
        <div className="sk-bar sk-half" />
      </div>

      {/* 提交按钮 */}
      <div className="sk-btn">
        <div className="sk-bar sk-btn-bar" />
      </div>

      {/* 6 统计卡片 */}
      <div className="sk-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="sk-card">
            <div className="sk-bar sk-card-val" />
            <div className="sk-bar sk-card-label" />
          </div>
        ))}
      </div>

      {/* 记录列表骨架 */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="sk-record">
          <div className="sk-bar sk-rec-cat" />
          <div className="sk-row">
            <div className="sk-bar sk-rec-amount" />
            <div className="sk-bar sk-rec-btn" />
          </div>
          <div className="sk-bar sk-rec-date" />
        </div>
      ))}
    </div>
  )
}
