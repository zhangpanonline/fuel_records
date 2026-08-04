/* 图表公共颜色配置 */

export const CHART_COLORS = [
  '#5470c6',
  '#91cc75',
  '#fac858',
  '#ee6666',
  '#73c0de',
  '#3ba272',
  '#fc8452',
  '#9a60b4',
  '#ea7ccc',
  '#6e7074',
]

export function legendColor(idx: number, name: string): string {
  return name === '其他' ? '#9ca3af' : CHART_COLORS[idx % CHART_COLORS.length]
}
