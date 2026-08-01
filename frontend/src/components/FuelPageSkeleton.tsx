import './FuelPageSkeleton.css'

export default function FuelPageSkeleton() {
  return (
    <div className="fuel-skeleton">
      {/* 车辆选择器 */}
      <div className="fsk-vehicle-bar">
        <div className="sk-bar fsk-select" />
        <div className="sk-bar fsk-add-btn" />
      </div>

      {/* 录入表单 */}
      <div className="fsk-form">
        <div className="fsk-form-header">
          <div className="sk-bar fsk-form-title" />
        </div>
        <div className="fsk-form-grid">
          <div className="fsk-field">
            <div className="sk-bar fsk-label" />
            <div className="sk-bar fsk-input" />
          </div>
          <div className="fsk-field">
            <div className="sk-bar fsk-label" />
            <div className="sk-bar fsk-input" />
          </div>
        </div>
        <div className="fsk-field">
          <div className="sk-bar fsk-label" />
          <div className="sk-bar fsk-input" />
        </div>
        <div className="sk-bar fsk-submit" />
      </div>

      {/* 统计 + 筛选 */}
      <div className="fsk-filter-row">
        <div className="sk-bar fsk-summary" />
        <div className="sk-bar fsk-filter-btn" />
      </div>

      {/* 记录列表骨架 */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="fsk-record">
          <div className="fsk-rec-header">
            <div className="sk-bar fsk-rec-title" />
            <div className="sk-bar fsk-rec-tag" />
          </div>
          <div className="fsk-rec-body">
            <div className="fsk-rec-stat">
              <div className="sk-bar fsk-rec-label-s" />
              <div className="sk-bar fsk-rec-val" />
            </div>
            <div className="fsk-rec-stat">
              <div className="sk-bar fsk-rec-label-s" />
              <div className="sk-bar fsk-rec-val" />
            </div>
            <div className="fsk-rec-stat">
              <div className="sk-bar fsk-rec-label-s" />
              <div className="sk-bar fsk-rec-val" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
