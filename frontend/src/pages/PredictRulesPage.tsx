/** 预测引擎调试页面 — 规则列表 + 行为日志 + 手动操作 */

import { usePrediction } from '../context/PredictionContext'
import { getActionDisplay } from '../engine/types'
import type { Rule } from '../engine/types'
import './PredictRulesPage.css'

function formatShortTime(iso: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function conditionSummary(rule: Rule): string {
  const c = rule.condition
  const parts: string[] = []
  if (c.page) parts.push(c.page)
  if (c.hasRecordsToday !== undefined) parts.push(c.hasRecordsToday ? '有记录' : '无记录')
  if (c.chartType) parts.push(c.chartType === 'pie' ? '饼图' : '柱状图')
  if (c.isFullscreen) parts.push('全屏')
  if (c.isEditing) parts.push('编辑中')
  if (c.isFilterOpen) parts.push('筛选开')
  if (c.hourRange) parts.push(`${c.hourRange[0]}-${c.hourRange[1]}时`)
  if (c.dayOfWeek?.length) {
    const names = ['日', '一', '二', '三', '四', '五', '六']
    parts.push(`周${c.dayOfWeek.map((d) => names[d]).join('/')}`)
  }
  return parts.join(' · ') || '(全匹配)'
}

function typeLabel(type: Rule['type']): string {
  switch (type) {
    case 'seed': return '🌱 种子'
    case 'generated': return '🤖 生成'
    case 'temporary': return '⏳ 临时'
  }
}

export default function PredictRulesPage() {
  const prediction = usePrediction()
  const rules = prediction.rules

  return (
    <div className="predict-rules-page">
      <header className="predict-rules-header">
        <button
          className="predict-rules-back"
          onClick={() => window.history.back()}
        >
          ← 返回
        </button>
        <h2>预测引擎</h2>
      </header>

      {/* 操作区 */}
      <div className="predict-rules-actions">
        <button
          className="predict-rules-action-btn warn"
          onClick={() => {
            if (confirm('确定要重置所有权重吗？这将清除所有规则的学习数据，仅保留种子规则。')) {
              prediction.resetAllWeights()
            }
          }}
        >
          重置所有权重
        </button>
        <button
          className="predict-rules-action-btn danger"
          onClick={() => {
            if (confirm('确定要清空行为日志吗？这将删除所有用户行为记录。')) {
              prediction.clearBehaviorLog()
            }
          }}
        >
          清空行为日志
        </button>
      </div>

      {/* 规则列表 */}
      <section className="predict-rules-section">
        <h3>规则列表 ({rules.length})</h3>
        {rules.length === 0 ? (
          <p className="predict-rules-empty">暂无规则</p>
        ) : (
          <div className="predict-rules-table-wrapper">
            <table className="predict-rules-table">
              <thead>
                <tr>
                  <th>条件</th>
                  <th>动作</th>
                  <th>权重</th>
                  <th>类型</th>
                  <th>命中/误判</th>
                  <th>最近命中</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => {
                  const disp = getActionDisplay(rule.action)
                  return (
                    <tr key={rule.id}>
                      <td className="predict-rules-condition" title={conditionSummary(rule)}>
                        {conditionSummary(rule)}
                      </td>
                      <td>
                        <span className="predict-rules-action-name">
                          {disp.icon} {disp.label}
                        </span>
                      </td>
                      <td>
                        <span
                          className="predict-rules-weight"
                          style={{ color: rule.weight >= 0 ? '#22c55e' : '#ef4444' }}
                        >
                          {rule.weight > 0 ? `+${rule.weight}` : rule.weight}
                        </span>
                      </td>
                      <td>
                        <span className={`predict-rules-type predict-rules-type--${rule.type}`}>
                          {typeLabel(rule.type)}
                        </span>
                      </td>
                      <td>
                        <span className="predict-rules-hits">
                          <span style={{ color: '#22c55e' }}>{rule.hitCount}</span>
                          {' / '}
                          <span style={{ color: '#ef4444' }}>{rule.missCount}</span>
                        </span>
                      </td>
                      <td className="predict-rules-time">
                        {formatShortTime(rule.lastHitAt)}
                      </td>
                      <td>
                        <button
                          className="predict-rules-delete-btn"
                          onClick={() => {
                            if (confirm(`确定删除规则 "${disp.label}" 吗？`)) {
                              prediction.deleteRule(rule.id)
                            }
                          }}
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
