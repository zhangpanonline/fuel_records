import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { CHART_COLORS } from './chartConfig'
import type { PieDatum } from '../hooks/useChartDrilldown'

/* 饼图面板 — 统一全屏/非全屏渲染，消除 60+ 行重复 */

export interface PieChartPanelProps {
  pieData: PieDatum[]
  pieLegendItems: LegendItem[]
  pieTitle: string
  drillPath: string[]
  hasPieData: boolean
  fullscreen: boolean
  onDrill: (name: string) => void
  onBack: () => void
  onToggleFullscreen?: () => void
}

export interface LegendItem {
  name: string
  value: number
  percent: string
  color: string
}

export default function PieChartPanel({
  pieData,
  pieLegendItems,
  pieTitle,
  drillPath,
  hasPieData,
  fullscreen,
  onDrill,
  onBack,
  onToggleFullscreen,
}: PieChartPanelProps) {
  const outerRadius = fullscreen ? 130 : 90
  const height = fullscreen ? '55%' : 220
  const labelFontSize = fullscreen ? 14 : 13
  const labelSubFontSize = fullscreen ? 13 : 12
  const labelRadiusMul = fullscreen ? 1.2 : 1.25

  return (
    <div className="chart-section">
      {!fullscreen && onToggleFullscreen && (
        <button
          className="chart-fullscreen-btn"
          onClick={onToggleFullscreen}
          title="全屏"
        >
          ⛶
        </button>
      )}
      <div className="pie-drill-header">
        {drillPath.length > 0 && (
          <button className="stats-time-btn" onClick={onBack}>
            ← 返回
          </button>
        )}
        <span className="pie-drill-title">{pieTitle}</span>
      </div>
      {hasPieData ? (
        <>
          <ResponsiveContainer width="100%" height={height}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={outerRadius}
                label={({
                  cx,
                  cy,
                  midAngle = 0,
                  outerRadius,
                  name,
                  percent,
                }) => {
                  const RADIAN = Math.PI / 180
                  const radius = outerRadius * labelRadiusMul
                  const x =
                    cx + radius * Math.cos(-midAngle * RADIAN)
                  const y =
                    cy + radius * Math.sin(-midAngle * RADIAN)
                  const textAnchor = x > cx ? 'start' : 'end'
                  return (
                    <text
                      x={x}
                      y={y}
                      fill="var(--text-secondary)"
                      textAnchor={textAnchor}
                      dominantBaseline="central"
                      fontSize={labelFontSize}
                    >
                      <tspan fontWeight={500}>{name}</tspan>
                      <tspan fill="var(--text-dim)" fontSize={labelSubFontSize}>
                        {' '}
                        {((percent ?? 0) * 100).toFixed(0)}%
                      </tspan>
                    </text>
                  )
                }}
                labelLine={{
                  stroke: 'var(--text-dim)',
                  strokeWidth: 1,
                  opacity: 0.5,
                }}
                onClick={(_, index) => onDrill(pieData[index].name)}
              >
                {pieData.map((_, i) => {
                  const isOther = pieData[i].name === '其他'
                  return (
                    <Cell
                      key={i}
                      fill={
                        isOther
                          ? '#9ca3af'
                          : CHART_COLORS[i % CHART_COLORS.length]
                      }
                    />
                  )
                })}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div
            className={`pie-legend${fullscreen ? ' pie-legend--fs' : ''}`}
          >
            {pieLegendItems.map((item) => (
              <div
                key={item.name}
                className="pie-legend-item"
                onClick={() => onDrill(item.name)}
              >
                <span className="pie-legend-info">
                  <span
                    className="pie-legend-dot"
                    style={{ background: item.color }}
                  />
                  <span className="pie-legend-name">{item.name}</span>
                  <span className="pie-legend-pct">{item.percent}%</span>
                </span>
                <span className="pie-legend-amount">
                  ¥{item.value.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="chart-placeholder">暂无分类数据</div>
      )}
    </div>
  )
}
