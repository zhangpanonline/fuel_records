import type { MultiSummaryResponse } from '../services/api'
import './ExpenseSummaryCards.css'

interface Props {
  data: MultiSummaryResponse | null
}

const CARDS: { key: keyof MultiSummaryResponse; label: string }[] = [
  { key: 'current_year', label: '当年' },
  { key: 'current_month', label: '当月' },
  { key: 'current_week', label: '当周' },
  { key: 'recent_year', label: '近一年' },
  { key: 'recent_month', label: '近一月' },
  { key: 'recent_week', label: '近一周' },
]

function formatAmount(v: number): string {
  const n = Number(v)
  return isNaN(n) ? '¥0.00' : `¥${n.toFixed(2)}`
}

export default function ExpenseSummaryCards({ data }: Props) {
  return (
    <div className="expense-summary-grid">
      {CARDS.map(({ key, label }) => (
        <div key={key} className="summary-card">
          <div className="summary-card-amount">
            {data ? formatAmount(data[key]) : '¥0.00'}
          </div>
          <div className="summary-card-label">{label}</div>
        </div>
      ))}
    </div>
  )
}
